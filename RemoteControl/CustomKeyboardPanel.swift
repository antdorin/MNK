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

    private let bgColors: [(String, Color)] = [
        ("Black",    .black),
        ("Dark Gray", Color(white: 0.15)),
        ("Navy",     Color(red: 0.05, green: 0.05, blue: 0.2)),
        ("Charcoal", Color(red: 0.12, green: 0.12, blue: 0.14)),
        ("Midnight", Color(red: 0.08, green: 0.02, blue: 0.15)),
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

            VStack(spacing: 3) {
                // QWERTY rows
                ForEach(rows, id: \.self) { row in
                    HStack(spacing: 3) {
                        ForEach(row, id: \.self) { key in
                            uniButton(title: key) {
                                wsManager.send(["type": "keydown", "key": key])
                            }
                        }
                    }
                }

                // Utility row 1: Enter / Space / Del
                HStack(spacing: 3) {
                    uniButton(title: "⏎") {
                        wsManager.send(["type": "keydown", "key": "Return"])
                    }
                    uniButton(title: "Space", stretch: true) {
                        wsManager.send(["type": "keydown", "key": " "])
                    }
                    uniButton(title: "⌫") {
                        wsManager.send(["type": "keydown", "key": "Backspace"])
                    }
                }

                // Utility row 2: Esc / Tab / ⚙ / 🎮 / Hide
                HStack(spacing: 3) {
                    uniButton(title: "Esc") {
                        wsManager.send(["type": "keydown", "key": "Escape"])
                    }
                    uniButton(title: "Tab") {
                        wsManager.send(["type": "keydown", "key": "Tab"])
                    }
                    uniButton(title: "⚙", highlight: showSettings) {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.82)) {
                            showSettings.toggle()
                        }
                    }
                    // Gaming mode
                    Button {
                        wsManager.gamingMode.toggle()
                    } label: {
                        Image(systemName: "gamecontroller.fill")
                            .font(.system(size: 16))
                            .frame(maxWidth: .infinity)
                            .frame(height: 46)
                            .background(wsManager.gamingMode ? Color.red.opacity(0.35) : Color.white.opacity(0.08))
                            .cornerRadius(8)
                            .shadow(color: wsManager.gamingMode ? .red.opacity(0.7) : .clear, radius: 8)
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(wsManager.gamingMode ? .red : Color(.systemGray))

                    uniButton(title: "▾") {
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
            .padding(.horizontal, 4)
            .padding(.top, 6)
            .padding(.bottom, max(safeAreaBottom, 8))
        }
        .frame(maxWidth: .infinity)
        .frame(height: (showSettings ? openHeight + 100 : openHeight) + safeAreaBottom)
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

    // MARK: – Settings row

    private var settingsRow: some View {
        VStack(spacing: 8) {
            HStack(spacing: 8) {
                // Connection
                Button(action: onConnect) {
                    HStack(spacing: 5) {
                        Circle()
                            .fill(wsManager.isConnected ? Color.green : Color.red)
                            .frame(width: 7, height: 7)
                        Image(systemName: wsManager.isConnected ? "wifi" : "wifi.slash")
                            .font(.system(size: 14))
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 40)
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
                        .frame(maxWidth: .infinity)
                        .frame(height: 40)
                        .background(Color.blue.opacity(0.28))
                        .cornerRadius(10)
                }
                .buttonStyle(.plain)
                .foregroundStyle(.white)
            }

            // Background color picker
            HStack(spacing: 6) {
                Text("BG")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
                ForEach(bgColors, id: \.0) { name, color in
                    Button {
                        wsManager.trackpadColor = color
                    } label: {
                        Circle()
                            .fill(color)
                            .frame(width: 28, height: 28)
                            .overlay(
                                Circle()
                                    .strokeBorder(Color.white, lineWidth: wsManager.trackpadColor == color ? 2 : 0)
                            )
                    }
                    .buttonStyle(.plain)
                }
                Spacer()
            }
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

    // MARK: – Uniform button (same size for everything)

    @ViewBuilder
    private func uniButton(title: String, stretch: Bool = false, highlight: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: title.count == 1 ? 20 : 15, weight: title.count == 1 ? .medium : .semibold))
                .frame(maxWidth: .infinity)
                .frame(height: 46)
                .background(highlight ? Color.accentColor.opacity(0.3) : Color.white.opacity(0.1))
                .cornerRadius(8)
        }
        .buttonStyle(.plain)
        .foregroundStyle(.white)
    }
}
