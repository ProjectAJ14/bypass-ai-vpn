import Cocoa

// bypass-vpn menu-bar app. Left-click the icon → add routes. Right-click → menu.
// The CLI path is baked in at build time by build.sh (replaces __SCRIPT_PATH__).
// node is resolved fresh via a login shell so nvm/asdf setups keep working.
let scriptPath = "__SCRIPT_PATH__"

final class AppDelegate: NSObject, NSApplicationDelegate {
    let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    var resetTimer: Timer?
    var spinnerTimer: Timer?
    let spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
    var spinnerIndex = 0

    let logURL = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent("Library/Logs/bypass-vpn.log")

    func applicationDidFinishLaunching(_ note: Notification) {
        if let button = statusItem.button {
            button.target = self
            button.action = #selector(handleClick)
            button.sendAction(on: [.leftMouseUp, .rightMouseUp])
        }
        showIdle()
    }

    @objc func handleClick() {
        if NSApp.currentEvent?.type == .rightMouseUp {
            showMenu()
        } else {
            run(remove: false)
        }
    }

    func showMenu() {
        let menu = NSMenu()
        menu.addItem(withTitle: "Apply (Add Routes)", action: #selector(menuAdd), keyEquivalent: "").target = self
        menu.addItem(withTitle: "Remove Routes", action: #selector(menuRemove), keyEquivalent: "").target = self
        menu.addItem(.separator())
        menu.addItem(withTitle: "Open Log", action: #selector(openLog), keyEquivalent: "").target = self
        menu.addItem(.separator())
        menu.addItem(withTitle: "Quit", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        // popUp under the button — reliable, and leaves left-click as the Apply action.
        guard let button = statusItem.button else { return }
        menu.popUp(positioning: nil, at: NSPoint(x: 0, y: button.bounds.height + 4), in: button)
    }

    @objc func menuAdd() { run(remove: false) }
    @objc func menuRemove() { run(remove: true) }

    @objc func openLog() {
        if !FileManager.default.fileExists(atPath: logURL.path) {
            try? "".data(using: .utf8)?.write(to: logURL)
        }
        NSWorkspace.shared.open(logURL)
    }

    func run(remove: Bool) {
        resetTimer?.invalidate()
        startSpinner()

        DispatchQueue.global(qos: .userInitiated).async {
            let task = Process()
            task.executableURL = URL(fileURLWithPath: "/bin/zsh")
            let mode = remove ? "--remove " : ""
            // Login shell (-l) so PATH includes node; -c runs the command.
            task.arguments = ["-lc", "node '\(scriptPath)' \(mode)--no-anim --no-banner"]

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

            // Exit code catches "no gateway"/errors. The CLI always prints the word
            // "failed" (e.g. "0 failed"), so parse the actual count instead.
            let failed = Self.firstInt(in: output, pattern: "([0-9]+) failed")
            let ok = status == 0 && failed == 0
            self.writeLog(remove: remove, status: status, ok: ok, output: output)
            DispatchQueue.main.async { self.finish(ok: ok, output: output) }
        }
    }

    // ── Menu-bar states ────────────────────────────────────────────

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

    func finish(ok: Bool, output: String) {
        spinnerTimer?.invalidate()
        statusItem.button?.title = ""
        let tail = output.split(separator: "\n").suffix(3).joined(separator: "\n")
        setIcon(ok ? "checkmark.circle.fill" : "xmark.circle.fill",
                tint: nil, // keep it white/template — the ✓ vs ✗ shape carries the meaning
                tip: (ok ? "Routed successfully" : "Failed") + "\n\(tail)\n\n(Open Log for details)")
        resetTimer = Timer.scheduledTimer(withTimeInterval: 4, repeats: false) { [weak self] _ in
            self?.showIdle()
        }
    }

    func showIdle() {
        spinnerTimer?.invalidate()
        statusItem.button?.title = ""
        setIcon("bolt.horizontal.circle", tint: nil, tip: "bypass-vpn — click to route AI traffic")
    }

    func setIcon(_ symbol: String, tint: NSColor?, tip: String) {
        guard let button = statusItem.button else { return }
        button.image = NSImage(systemSymbolName: symbol, accessibilityDescription: tip)
        button.contentTintColor = tint
        button.toolTip = tip
    }

    // Returns the first capture group as Int, or 0 if the pattern doesn't match.
    static func firstInt(in text: String, pattern: String) -> Int {
        guard let re = try? NSRegularExpression(pattern: pattern),
              let m = re.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)),
              let r = Range(m.range(at: 1), in: text) else { return 0 }
        return Int(text[r]) ?? 0
    }

    // ── Logging ────────────────────────────────────────────────────

    func writeLog(remove: Bool, status: Int32, ok: Bool, output: String) {
        let fmt = DateFormatter()
        fmt.dateFormat = "yyyy-MM-dd HH:mm:ss"
        let entry = """
        [\(fmt.string(from: Date()))] \(remove ? "remove" : "add") — exit \(status) (\(ok ? "ok" : "FAILED"))
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
