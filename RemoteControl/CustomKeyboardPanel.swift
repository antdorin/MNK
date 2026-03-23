import SwiftUI

struct CustomKeyboardPanel: View {
    @EnvironmentObject var wsManager: WebSocketManager

    let safeAreaBottom: CGFloat
    let onConnect: () -> Void

    @State private var isOpen = false
    @State private var dragOffset: CGFloat = 0
    @State private var showSettings = false

    private let collapsedHeight: CGFloat = 34
    private let openHeight: CGFloat = 370

    private let rows: [[String]] = [
        ["1","2","3","4","5","6","7","8","9","0"],
        ["q","w","e","r","t","y","u","i","o","p"],
        ["a","s","d","f","g","h","j","k","l"],
        ["z","x","c","v","b","n","m"]
    ]

    private var panelOffset: CGFloat {
        let base = isOpen ? 0 : (openHeight - collapsedHeight)
        return max(0, min(openHeight, base + dragOffset))
    }

    var body: some View {
        VStack(spacing: 0) {
            handle
                .frame(maxWidth: .infinity)
                .frame(height: collapsedHeight)
                .contentShape(Rectangle())
                .onTapGesture {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.82)) {
                        isOpen.toggle()
                    }
                }

            VStack(spacing: 10) {
                // QWERTY rows
                ForEach(rows, id: \.self) { row in
                    HStack(spacing: 5) {
                        ForEach(row, id: \.self) { key in
                            keyButton(title: key) {
                                wsManager.send(["type": "keydown", "key": key])
                            }
                        }
                    }
                }

                // Utility row 1: Tab / Space / Backspace
                HStack(spacing: 5) {
                    wideButton(title: "Tab", icon: "arrow.right.to.line") {
                        wsManager.send(["type": "keydown", "key": "Tab"])
                    }
                    Button {
                        wsManager.send(["type": "keydown", "key": " "])
                    } label: {
                        Text("Space")
                            .font(.system(size: 15, weight: .semibold))
                            .frame(maxWidth: .infinity)
                            .frame(height: 46)
                            .background(Color.white.opacity(0.12))
                            .cornerRadius(10)
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(.white)

                    wideButton(title: "Del", icon: "delete.left") {
                        wsManager.send(["type": "keydown", "key": "Backspace"])
                    }
                }

                // Utility row 2: Esc / Return / Settings / Gaming / Hide
                HStack(spacing: 5) {
                    wideButton(title: "Esc", icon: nil) {
                        wsManager.send(["type": "keydown", "key": "Escape"])
                    }
                    wideButton(title: "⏎", icon: nil) {
                        wsManager.send(["type": "keydown", "key": "Return"])
                    }

                    // Settings (opens top control panel)
                    Button {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.82)) {
                            showSettings.toggle()
                        }
                    } label: {
                        Image(systemName: "gearshape.fill")
                            .font(.system(size: 16))
                            .frame(width: 46, height: 46)
                            .background(showSettings ? Color.accentColor.opacity(0.3) : Color.white.opacity(0.12))
                            .cornerRadius(10)
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(.white)

                    // Gaming mode toggle
                    Button {
                        wsManager.gamingMode.toggle()
                    } label: {
                        Image(systemName: "gamecontroller.fill")
                            .font(.system(size: 16))
                            .frame(width: 46, height: 46)
                            .background(wsManager.gamingMode ? Color.red.opacity(0.35) : Color.white.opacity(0.08))
                            .cornerRadius(10)
                            .shadow(color: wsManager.gamingMode ? .red.opacity(0.7) : .clear, radius: 8)
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(wsManager.gamingMode ? .red : Color(.systemGray))

                    wideButton(title: "Hide", icon: "chevron.down") {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.82)) {
                            isOpen = false
                            showSettings = false
                        }
                    }
                }

                // Inline settings panel
                if showSettings {
                    settingsRow
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .padding(.horizontal, 8)
            .padding(.top, 6)
            .padding(.bottom, max(safeAreaBottom, 8))
        }
        .frame(maxWidth: .infinity)
        .frame(height: (showSettings ? openHeight + 60 : openHeight) + safeAreaBottom)
        .background(.ultraThinMaterial)
        .clipShape(RoundedCorner(radius: 20, corners: [.topLeft, .topRight]))
        .offset(y: panelOffset)
        .gesture(
            DragGesture(minimumDistance: 10)
                .onChanged { value in
                    dragOffset = value.translation.height
                }
                .onEnded { value in
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.82)) {
                        if value.translation.height < -30 { isOpen = true }
                        if value.translation.height > 30 { isOpen = false; showSettings = false }
                        dragOffset = 0
                    }
                }
        )
    }

    // MARK: – Settings row (replaces TopControlPanel)

    private var settingsRow: some View {
        HStack(spacing: 8) {
            // Connection status + button
            Button(action: onConnect) {
                HStack(spacing: 5) {
                    Circle()
                        .fill(wsManager.isConnected ? Color.green : Color.red)
                        .frame(width: 7, height: 7)
                    Image(systemName: wsManager.isConnected ? "wifi" : "wifi.slash")
                        .font(.system(size: 14))
                }
                .frame(height: 40)
                .padding(.horizontal, 10)
                .background(Color.white.opacity(0.12))
                .cornerRadius(10)
            }
            .buttonStyle(.plain)
            .foregroundStyle(wsManager.isConnected ? .green : .red)

            // Speed slider
            Image(systemName: "cursorarrow.motionlines")
                .font(.caption2)
                .foregroundStyle(.secondary)
            Slider(value: $wsManager.mouseSpeed, in: 0.5...10.0, step: 0.5)
                .tint(.accentColor)
            Text(String(format: "%.1fx", wsManager.mouseSpeed))
                .font(.caption2)
                .foregroundStyle(.secondary)
                .monospacedDigit()
                .frame(width: 36, alignment: .trailing)

            // Snooze
            Button {
                wsManager.send(["type": "alarm-snooze"])
            } label: {
                Text("Snooze")
                    .font(.caption2.weight(.semibold))
                    .frame(height: 40)
                    .padding(.horizontal, 10)
                    .background(Color.blue.opacity(0.28))
                    .cornerRadius(10)
            }
            .buttonStyle(.plain)
            .foregroundStyle(.white)
        }
        .padding(.horizontal, 4)
        .padding(.vertical, 4)
    }

    // MARK: – Handle

    private var handle: some View {
        VStack(spacing: 4) {
            RoundedRectangle(cornerRadius: 3)
                .fill(Color.secondary.opacity(0.5))
                .frame(width: 34, height: 5)
                .padding(.top, 8)

            Text(isOpen ? "Swipe down to close" : "Swipe up for keyboard")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
    }

    // MARK: – Key buttons

    @ViewBuilder
    private func keyButton(title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 20, weight: .medium))
                .frame(maxWidth: .infinity)
                .frame(height: 46)
                .background(Color.white.opacity(0.1))
                .cornerRadius(10)
        }
        .buttonStyle(.plain)
        .foregroundStyle(.white)
    }

    @ViewBuilder
    private func wideButton(title: String, icon: String? = nil, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Group {
                if let icon {
                    Label(title, systemImage: icon)
                        .labelStyle(.iconOnly)
                        .font(.system(size: 16))
                } else {
                    Text(title)
                        .font(.system(size: 15, weight: .semibold))
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: 46)
            .background(Color.white.opacity(0.12))
            .cornerRadius(10)
        }
        .buttonStyle(.plain)
        .foregroundStyle(.white)
    }
}
