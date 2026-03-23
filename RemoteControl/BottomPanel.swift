import SwiftUI

// MARK: – Bottom panel: swipe up to open, swipe down to close
//   Contains: mouse speed slider, keyboard toggle, connect button

struct BottomPanel: View {
    @EnvironmentObject var wsManager: WebSocketManager

    let safeAreaBottom:  CGFloat
    @Binding var isKeyboardActive: Bool
    let onConnect: () -> Void

    @State private var isExpanded  = false
    @State private var dragOffset: CGFloat = 0

    private let collapsedHeight: CGFloat = 38
    private let expandedHeight:  CGFloat = 210

    // Offset pushes the panel down when collapsed
    private var panelOffset: CGFloat {
        let base = isExpanded ? 0 : (expandedHeight - collapsedHeight)
        return max(0, min(expandedHeight, base + dragOffset))
    }

    var body: some View {
        VStack(spacing: 0) {

            // ── Handle + hint ──────────────────────────────────────────
            VStack(spacing: 5) {
                RoundedRectangle(cornerRadius: 3)
                    .fill(Color.secondary.opacity(0.45))
                    .frame(width: 36, height: 5)
                    .padding(.top, 8)

                if !isExpanded {
                    Text(wsManager.isConnected ? "⌃ controls" : "⌃ not connected")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(.secondary)
                        .padding(.bottom, 4)
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: collapsedHeight)
            .contentShape(Rectangle())
            .onTapGesture {
                withAnimation(.spring(response: 0.35, dampingFraction: 0.78)) {
                    isExpanded.toggle()
                }
            }

            // ── Expanded content ───────────────────────────────────────
            VStack(spacing: 16) {

                // Speed slider
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Label("Mouse Speed", systemImage: "cursorarrow.motionlines")
                            .font(.subheadline.weight(.medium))
                        Spacer()
                        Text(String(format: "%.1f×", wsManager.mouseSpeed))
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .monospacedDigit()
                    }
                    Slider(value: $wsManager.mouseSpeed, in: 0.5...5.0, step: 0.5)
                        .tint(.accentColor)
                }
                .padding(.horizontal, 20)

                // Keyboard + Connect row
                HStack(spacing: 12) {
                    // Keyboard toggle
                    Button {
                        guard wsManager.isConnected else { return }
                        isKeyboardActive.toggle()
                    } label: {
                        Label(
                            isKeyboardActive ? "Hide Keyboard" : "Show Keyboard",
                            systemImage: isKeyboardActive
                                ? "keyboard.chevron.compact.down.fill"
                                : "keyboard"
                        )
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(
                            isKeyboardActive
                                ? Color.accentColor
                                : Color.white.opacity(0.08)
                        )
                        .foregroundStyle(isKeyboardActive ? .white : .primary)
                        .cornerRadius(12)
                    }
                    .disabled(!wsManager.isConnected)

                    // Connect button
                    Button(action: onConnect) {
                        Label(
                            wsManager.isConnected ? "Connected" : "Connect",
                            systemImage: wsManager.isConnected ? "wifi" : "wifi.slash"
                        )
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(
                            wsManager.isConnected
                                ? Color.green.opacity(0.18)
                                : Color.white.opacity(0.08)
                        )
                        .foregroundStyle(wsManager.isConnected ? .green : .red)
                        .cornerRadius(12)
                    }
                }
                .padding(.horizontal, 20)
            }
            .padding(.bottom, max(safeAreaBottom, 8))

        }
        .frame(maxWidth: .infinity)
        .frame(height: expandedHeight + safeAreaBottom)
        .background(.ultraThinMaterial)
        .clipShape(RoundedCorner(radius: 22, corners: [.topLeft, .topRight]))
        .offset(y: panelOffset)
        .gesture(
            DragGesture(minimumDistance: 8)
                .onChanged { value in
                    dragOffset = value.translation.height
                }
                .onEnded { value in
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.78)) {
                        if value.translation.height < -40 { isExpanded = true  }
                        else if value.translation.height > 40 { isExpanded = false }
                        dragOffset = 0
                    }
                }
        )
    }
}

// MARK: – Rounded corners helper

struct RoundedCorner: Shape {
    var radius:  CGFloat
    var corners: UIRectCorner

    func path(in rect: CGRect) -> Path {
        Path(UIBezierPath(
            roundedRect: rect,
            byRoundingCorners: corners,
            cornerRadii: CGSize(width: radius, height: radius)
        ).cgPath)
    }
}
