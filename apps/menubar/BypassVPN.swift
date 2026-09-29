import Cocoa
import Network
import ServiceManagement
import SwiftUI
import UserNotifications

// bypass-vpn menu-bar app. Click the icon → panel. Re-routes automatically when
// the Wi-Fi gateway changes or a VPN comes up (NWPathMonitor + debounce).
// The CLI path is baked in at build time by build.sh (replaces __SCRIPT_PATH__).
// node is resolved fresh via a login shell so nvm/asdf setups keep working.
let scriptPath = "__SCRIPT_PATH__"

struct ServiceResult: Decodable, Identifiable {
    let name: String, ok: Int, skip: Int, fail: Int
    var id: String { name }
}

struct RunResult: Decodable {
    let ok: Bool
    var mode: String?
    var gateway: String?
    var services: [ServiceResult]?
    var error: String?
}

final class Model: ObservableObject {
    @Published var running = false
    @Published var gateway: String?
    @Published var vpnUp = false
    @Published var last: RunResult?
    @Published var lastRun: Date?
    @Published var lastRunAuto = false
    @Published var autoRun = UserDefaults.standard.object(forKey: "autoRun") as? Bool ?? true {
        didSet { UserDefaults.standard.set(autoRun, forKey: "autoRun") }
    }
    @Published var launchAtLogin = SMAppService.mainApp.status == .enabled

    var apply: () -> Void = {}
    var remove: () -> Void = {}
    var openLog: () -> Void = {}

    func setLaunchAtLogin(_ on: Bool) {
        do {
            if on { try SMAppService.mainApp.register() } else { try SMAppService.mainApp.unregister() }
        } catch {
            NSLog("bypass-vpn: launch at login: \(error)")
        }
        launchAtLogin = SMAppService.mainApp.status == .enabled
    }
}

// ── Network probes ─────────────────────────────────────────────

/// Wi-Fi (en0) default gateway, same source gateway.js uses. nil when not on Wi-Fi.
func wifiGateway() -> String? {
    let task = Process()
    task.executableURL = URL(fileURLWithPath: "/sbin/route")
    task.arguments = ["-n", "get", "-ifscope", "en0", "default"]
    let pipe = Pipe()
    task.standardOutput = pipe
    task.standardError = FileHandle.nullDevice
    guard (try? task.run()) != nil else { return nil }
    let data = pipe.fileHandleForReading.readDataToEndOfFile()
    task.waitUntilExit()
    guard task.terminationStatus == 0, let out = String(data: data, encoding: .utf8) else { return nil }
    for line in out.split(separator: "\n") {
        let parts = line.split(separator: ":", maxSplits: 1).map { $0.trimmingCharacters(in: .whitespaces) }
        if parts.count == 2, parts[0] == "gateway",
           parts[1].range(of: #"^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$"#, options: .regularExpression) != nil {
            return parts[1]
        }
    }
    return nil
}

/// A VPN is up when a tunnel interface (utun/ipsec/ppp) is running with an IPv4 address.
/// macOS always keeps a few utun interfaces for iCloud etc., but those carry only IPv6.
func vpnIsUp() -> Bool {
    var head: UnsafeMutablePointer<ifaddrs>?
    guard getifaddrs(&head) == 0 else { return false }
    defer { freeifaddrs(head) }
    var p = head
    while let ifa = p {
        defer { p = ifa.pointee.ifa_next }
        let name = String(cString: ifa.pointee.ifa_name)
        let flags = Int32(ifa.pointee.ifa_flags)
        guard ["utun", "ipsec", "ppp"].contains(where: name.hasPrefix),
              flags & IFF_UP != 0, flags & IFF_RUNNING != 0,
              ifa.pointee.ifa_addr?.pointee.sa_family == UInt8(AF_INET) else { continue }
        return true
    }
    return false
}

// ── App ────────────────────────────────────────────────────────

final class AppDelegate: NSObject, NSApplicationDelegate {
    let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    let popover = NSPopover()
    let model = Model()
    let monitor = NWPathMonitor()
    var debounce: DispatchWorkItem?
    var lastSignature = ""
    var resetTimer: Timer?
    var spinnerTimer: Timer?
    let spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
    var spinnerIndex = 0

    let logURL = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent("Library/Logs/bypass-vpn.log")

    func applicationDidFinishLaunching(_ note: Notification) {
        model.apply = { [weak self] in self?.run(remove: false, auto: false) }
        model.remove = { [weak self] in self?.run(remove: true, auto: false) }
        model.openLog = { [weak self] in self?.openLog() }

        popover.behavior = .transient
        let host = NSHostingController(rootView: PanelView(model: model))
        // Track SwiftUI's size so the popover grows with the results list
        // instead of clipping the header off the top.
        host.sizingOptions = [.preferredContentSize]
        popover.contentViewController = host

        if let button = statusItem.button {
            button.target = self
            button.action = #selector(togglePanel)
        }
        showIdle()

        UNUserNotificationCenter.current().requestAuthorization(options: [.alert]) { _, _ in }

        // Fires on Wi-Fi join/leave and VPN up/down. The first callback arrives at
        // start, so a fresh launch also routes the current network once.
        monitor.pathUpdateHandler = { [weak self] _ in
            DispatchQueue.main.async { self?.scheduleCheck() }
        }
        monitor.start(queue: .global(qos: .utility))
    }

    @objc func togglePanel() {
        guard let button = statusItem.button else { return }
        if popover.isShown {
            popover.performClose(nil)
        } else {
            NSApp.activate(ignoringOtherApps: true)
            popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
        }
    }

    // ── Auto-run ───────────────────────────────────────────────

    /// Networks flap while joining and DHCP needs a moment to hand out the
    /// gateway, so wait for things to settle before looking.
    func scheduleCheck() {
        debounce?.cancel()
        let item = DispatchWorkItem { [weak self] in self?.check() }
        debounce = item
        DispatchQueue.main.asyncAfter(deadline: .now() + 3, execute: item)
    }

    func check() {
        DispatchQueue.global(qos: .utility).async {
            let gw = wifiGateway(), vpn = vpnIsUp()
            DispatchQueue.main.async { self.networkChanged(gateway: gw, vpn: vpn) }
        }
    }

    func networkChanged(gateway: String?, vpn: Bool) {
        model.gateway = gateway
        model.vpnUp = vpn
        if !model.running, model.last?.ok != false { showIdle() }

        // Only act when the network actually changed. Our own route adds also
        // fire path events; the unchanged signature swallows those.
        let signature = "\(gateway ?? "-")|\(vpn)"
        guard signature != lastSignature else { return }
        lastSignature = signature

        guard model.autoRun, gateway != nil else { return }
        if model.running {
            scheduleCheck() // re-evaluate after the current run finishes
            lastSignature = ""
            return
        }
        run(remove: false, auto: true)
    }

    // ── Running the CLI ────────────────────────────────────────

    func run(remove: Bool, auto: Bool) {
        guard !model.running else { return }
        model.running = true
        resetTimer?.invalidate()
        startSpinner()

        DispatchQueue.global(qos: .userInitiated).async {
            let task = Process()
            task.executableURL = URL(fileURLWithPath: "/bin/zsh")
            let mode = remove ? "--remove " : ""
            // Login shell (-l) so PATH includes node; -c runs the command.
            task.arguments = ["-lc", "node '\(scriptPath)' \(mode)--json"]

            let pipe = Pipe()
            task.standardOutput = pipe
            task.standardError = pipe

            var status: Int32 = 1
            var output = ""
            do {
                try task.run()
                let data = pipe.fileHandleForReading.readDataToEndOfFile()
                task.waitUntilExit()
                status = task.terminationStatus
                output = String(data: data, encoding: .utf8) ?? ""
            } catch {
                output = error.localizedDescription
            }

            // The JSON result is the last line; anything else (missing sudoers
            // rule, node not found) is an error message worth showing as-is.
            let lastLine = output.split(separator: "\n").last.map(String.init) ?? ""
            let tail = output.trimmingCharacters(in: .whitespacesAndNewlines)
            var result = (try? JSONDecoder().decode(RunResult.self, from: Data(lastLine.utf8)))
                ?? RunResult(ok: false, error: tail.isEmpty ? "exit \(status)" : String(tail.suffix(300)))
            if status != 0 { result = RunResult(ok: false, mode: result.mode, gateway: result.gateway,
                                                services: result.services, error: result.error ?? "exit \(status)") }
            self.writeLog(remove: remove, auto: auto, status: status, ok: result.ok, output: output)
            DispatchQueue.main.async { self.finish(result, remove: remove, auto: auto) }
        }
    }

    func finish(_ result: RunResult, remove: Bool, auto: Bool) {
        spinnerTimer?.invalidate()
        statusItem.button?.title = ""
        model.running = false
        model.last = result
        model.lastRun = Date()
        model.lastRunAuto = auto

        if result.ok {
            setIcon("checkmark.shield.fill", tip: remove ? "Routes removed" : "Routed via \(result.gateway ?? "Wi-Fi")")
            resetTimer = Timer.scheduledTimer(withTimeInterval: 4, repeats: false) { [weak self] _ in
                self?.showIdle()
            }
        } else {
            // Failure sticks until the next successful run.
            setIcon("exclamationmark.shield.fill", tip: "Failed: \(result.error ?? "some routes failed")\n(Open Log for details)")
        }

        if auto {
            let routed = result.services?.reduce(0) { $0 + $1.ok } ?? 0
            notify(result.ok ? "Re-routed \(routed) hosts via \(result.gateway ?? "Wi-Fi")"
                             : "Auto-route failed: \(result.error ?? "some routes failed")")
        }
    }

    func notify(_ body: String) {
        let content = UNMutableNotificationContent()
        content.title = "Bypass VPN"
        content.body = body
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: "run", content: content, trigger: nil))
    }

    // ── Menu-bar states ────────────────────────────────────────

    func startSpinner() {
        spinnerIndex = 0
        statusItem.button?.image = nil
        statusItem.button?.toolTip = "Running…"
        spinnerTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            guard let self = self else { return }
            self.statusItem.button?.title = self.spinnerFrames[self.spinnerIndex]
            self.spinnerIndex = (self.spinnerIndex + 1) % self.spinnerFrames.count
        }
    }

    func showIdle() {
        guard !model.running else { return }
        statusItem.button?.title = ""
        if model.vpnUp {
            setIcon("bolt.shield.fill", tip: "bypass-vpn — VPN connected, AI traffic via Wi-Fi")
        } else {
            setIcon("shield.lefthalf.filled", tip: "bypass-vpn — no VPN detected")
        }
    }

    func setIcon(_ symbol: String, tip: String) {
        guard let button = statusItem.button else { return }
        let image = NSImage(systemSymbolName: symbol, accessibilityDescription: tip)
        image?.isTemplate = true // follows light/dark menu bar
        button.image = image
        button.toolTip = tip
    }

    // ── Logging ────────────────────────────────────────────────

    func openLog() {
        if !FileManager.default.fileExists(atPath: logURL.path) {
            try? "".data(using: .utf8)?.write(to: logURL)
        }
        NSWorkspace.shared.open(logURL)
    }

    func writeLog(remove: Bool, auto: Bool, status: Int32, ok: Bool, output: String) {
        let fmt = DateFormatter()
        fmt.dateFormat = "yyyy-MM-dd HH:mm:ss"
        let entry = """
        [\(fmt.string(from: Date()))] \(remove ? "remove" : "add")\(auto ? " (auto)" : "") — exit \(status) (\(ok ? "ok" : "FAILED"))
        \(output.trimmingCharacters(in: .whitespacesAndNewlines))
        ────────────────────────────────────────

        """
        // Overwrite — only the last run is kept.
        try? entry.data(using: .utf8)?.write(to: logURL)
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory) // menu-bar only, no Dock icon
app.run()
