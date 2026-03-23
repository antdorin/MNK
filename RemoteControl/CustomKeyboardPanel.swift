import SwiftUI

struct CustomKeyboardPanel: View {
    @EnvironmentObject var wsManager: WebSocketManager

    let safeAreaBottom: CGFloat
    @State private var isOpen = false
    @State private var dragOffset: CGFloat = 0

    private let collapsedHeight: CGFloat = 34
    private let openHeight: CGFloat = 290

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

            VStack(spacing: 8) {
                ForEach(rows, id: \.self) { row in
                    HStack(spacing: 6) {
                        ForEach(row, id: \.self) { key in
                            keyButton(title: key) {
                                wsManager.send(["type": "keydown", "key": key])
                            }
                        }
                    }
                }

                HStack(spacing: 6) {
                    wideButton(title: "Tab") {
                        wsManager.send(["type": "keydown", "key": "Tab"])
                    }
                    wideButton(title: "Space", stretch: true) {
                        wsManager.send(["type": "keydown", "key": " "])
                    }
                    wideButton(title: "Backspace") {
                        wsManager.send(["type": "keydown", "key": "Backspace"])
                    }
                }

                HStack(spacing: 6) {
                    wideButton(title: "Esc") {
                        wsManager.send(["type": "keydown", "key": "Escape"])
                    }
                    wideButton(title: "Return") {
                        wsManager.send(["type": "keydown", "key": "Return"])
                    }
                    wideButton(title: "Hide") {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.82)) {
                            isOpen = false
                        }
                    }
                }
            }
            .padding(.horizontal, 10)
            .padding(.top, 6)
            .padding(.bottom, max(safeAreaBottom, 8))
        }
        .frame(maxWidth: .infinity)
        .frame(height: openHeight + safeAreaBottom)
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
                        if value.translation.height > 30 { isOpen = false }
                        dragOffset = 0
                    }
                }
        )
    }

    private var handle: some View {
        VStack(spacing: 4) {
            RoundedRectangle(cornerRadius: 3)
                .fill(Color.secondary.opacity(0.5))
                .frame(width: 34, height: 5)
                .padding(.top, 8)

            Text(isOpen ? "Swipe down to close keyboard" : "Swipe up for keyboard")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private func keyButton(title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 18, weight: .medium))
                .frame(maxWidth: .infinity)
                .frame(height: 38)
                .background(Color.white.opacity(0.1))
                .cornerRadius(8)
        }
        .buttonStyle(.plain)
        .foregroundStyle(.white)
    }

    @ViewBuilder
    private func wideButton(title: String, stretch: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 14, weight: .semibold))
                .frame(maxWidth: stretch ? .infinity : nil)
                .frame(height: 38)
                .padding(.horizontal, stretch ? 0 : 12)
                .background(Color.white.opacity(0.12))
                .cornerRadius(8)
        }
        .buttonStyle(.plain)
        .foregroundStyle(.white)
    }
}
