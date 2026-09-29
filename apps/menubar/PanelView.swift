import SwiftUI

// The popover shown when the menu-bar icon is clicked. All state lives in Model.
struct PanelView: View {
    @ObservedObject var model: Model

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            header
            Divider()
            results
            actions
            Divider()
            Toggle("Auto-run on network change", isOn: $model.autoRun)
            Toggle("Launch at login", isOn: Binding(
                get: { model.launchAtLogin },
                set: { model.setLaunchAtLogin($0) }))
            Divider()
            footer
        }
        .toggleStyle(.switch)
        .controlSize(.small)
        .padding(14)
        .frame(width: 300)
        .fixedSize(horizontal: false, vertical: true)
    }

    var header: some View {
        HStack(spacing: 10) {
            Image(systemName: model.vpnUp ? "bolt.shield.fill" : "shield.lefthalf.filled")
                .font(.system(size: 22))
                .foregroundStyle(model.vpnUp ? Color.accentColor : .secondary)
            VStack(alignment: .leading, spacing: 2) {
                Text("Bypass VPN").font(.headline)
                Text(model.gateway.map { "Wi-Fi gateway \($0)" } ?? "Not on Wi-Fi")
                    .font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            pill(model.vpnUp ? "VPN on" : "No VPN", color: model.vpnUp ? .green : .gray)
        }
    }

    @ViewBuilder var results: some View {
        if model.running {
            HStack { ProgressView().controlSize(.small); Text("Routing…").foregroundStyle(.secondary) }
        } else if let last = model.last {
            if let error = last.error {
                Label(error, systemImage: "exclamationmark.triangle.fill")
                    .foregroundStyle(.orange).font(.caption).lineLimit(4)
            }
            ForEach(last.services ?? []) { s in
                HStack {
                    Image(systemName: s.fail > 0 ? "xmark.circle.fill" : "checkmark.circle.fill")
                        .foregroundStyle(s.fail > 0 ? .red : .green)
                    Text(s.name)
                    Spacer()
                    Text(s.fail > 0 ? "\(s.fail) failed" : "\(s.ok) \(last.mode == "remove" ? "removed" : "routed")")
                        .font(.caption.monospacedDigit()).foregroundStyle(.secondary)
                }
            }
        } else {
            Text("Not run yet").foregroundStyle(.secondary)
        }
    }

    var actions: some View {
        HStack {
            Button { model.apply() } label: { Label("Apply", systemImage: "arrow.triangle.branch").frame(maxWidth: .infinity) }
                .buttonStyle(.borderedProminent)
            Button { model.remove() } label: { Label("Remove", systemImage: "trash").frame(maxWidth: .infinity) }
                .buttonStyle(.bordered)
        }
        .controlSize(.regular)
        .disabled(model.running)
    }

    var footer: some View {
        HStack {
            if let date = model.lastRun {
                Text("\(model.lastRunAuto ? "Auto-run" : "Ran") \(date, style: .relative) ago")
                    .font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Button("Log") { model.openLog() }
            Button("Quit") { NSApp.terminate(nil) }
        }
        .buttonStyle(.link)
        .font(.caption)
    }

    func pill(_ text: String, color: Color) -> some View {
        Text(text)
            .font(.caption2.weight(.semibold))
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(color.opacity(0.18), in: Capsule())
            .foregroundStyle(color)
    }
}
