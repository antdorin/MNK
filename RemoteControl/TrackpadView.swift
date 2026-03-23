import SwiftUI

struct TrackpadView: View {
    @EnvironmentObject var wsManager: WebSocketManager

    // Gesture tracking
    @State private var prevTranslation: CGSize = .zero
    @State private var hasDragged              = false

    private let sensitivity: Double = 1.8

    var body: some View {
        VStack(spacing: 0) {

            // ── Status strip ──────────────────────────────────────────
            statusStrip

            // ── Trackpad surface ──────────────────────────────────────
            trackpadSurface
                .padding(.horizontal, 16)
                .padding(.top, 12)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .gesture(trackpadGesture)
                .disabled(!wsManager.isConnected)

            // ── Button row ─────────────────────────────────────────────
            controlButtons
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
        }
    }

    // MARK: – Sub-views

    private var statusStrip: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(wsManager.isConnected ? Color.green : Color.red)
                .frame(width: 8, height: 8)
            Text(wsManager.isConnected ? "Connected" : "Not connected — go to Connect tab")
                .font(.caption)
                .foregroundStyle(.secondary)
            Spacer()
        }
        .padding(.horizontal)
        .padding(.top, 8)
    }

    private var trackpadSurface: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 20)
                .fill(Color(.systemGray6))
                .overlay(
                    RoundedRectangle(cornerRadius: 20)
                        .strokeBorder(
                            wsManager.isConnected
                                ? Color.accentColor.opacity(0.5)
                                : Color.gray.opacity(0.3),
                            lineWidth: 1.5
                        )
                )

            if wsManager.isConnected {
                Text("Drag → move  ·  Tap → left click")
                    .font(.caption)
                    .foregroundStyle(Color.secondary.opacity(0.5))
            } else {
                VStack(spacing: 8) {
                    Image(systemName: "wifi.slash")
                        .font(.largeTitle)
                        .foregroundStyle(.secondary)
                    Text("Connect first")
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    private var controlButtons: some View {
        HStack(spacing: 10) {
            TrackpadActionButton(icon: "cursorarrow.click",   label: "Left") {
                wsManager.send(["type": "click", "button": "left"])
            }
            TrackpadActionButton(icon: "cursorarrow.click.2", label: "Right") {
                wsManager.send(["type": "click", "button": "right"])
            }
            TrackpadActionButton(icon: "arrow.up",            label: "Scroll ↑") {
                wsManager.send(["type": "scroll", "dy": -3])
            }
            TrackpadActionButton(icon: "arrow.down",          label: "Scroll ↓") {
                wsManager.send(["type": "scroll", "dy": 3])
            }
        }
        .disabled(!wsManager.isConnected)
    }

    // MARK: – Gesture

    private var trackpadGesture: some Gesture {
        DragGesture(minimumDistance: 0, coordinateSpace: .local)
            .onChanged { value in
                let dx = value.translation.width  - prevTranslation.width
                let dy = value.translation.height - prevTranslation.height
                prevTranslation = value.translation

                if abs(dx) > 0.4 || abs(dy) > 0.4 {
                    hasDragged = true
                    wsManager.send([
                        "type": "mousemove",
                        "dx":   dx * sensitivity,
                        "dy":   dy * sensitivity
                    ])
                }
            }
            .onEnded { _ in
                if !hasDragged {
                    // Treat as a tap → left click
                    wsManager.send(["type": "click", "button": "left"])
                }
                hasDragged       = false
                prevTranslation  = .zero
            }
    }
}

// MARK: – Reusable button

struct TrackpadActionButton: View {
    let icon:   String
    let label:  String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.system(size: 18))
                Text(label)
                    .font(.system(size: 10))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .background(Color(.systemGray5))
            .cornerRadius(10)
        }
        .foregroundStyle(.primary)
    }
}
