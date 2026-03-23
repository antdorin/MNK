import SwiftUI

struct TopControlPanel: View {
    @EnvironmentObject var wsManager: WebSocketManager

    let safeAreaTop: CGFloat
    let onConnect: () -> Void

    var body: some View {
        VStack {
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        Circle()
                            .fill(wsManager.isConnected ? Color.green : Color.red)
                            .frame(width: 8, height: 8)
                        Text(wsManager.isConnected ? "Connected" : "Disconnected")
                            .font(.caption.weight(.semibold))
                    }

                    HStack(spacing: 8) {
                        Image(systemName: "cursorarrow.motionlines")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Slider(value: $wsManager.mouseSpeed, in: 0.5...5.0, step: 0.5)
                            .tint(.accentColor)
                        Text(String(format: "%.1fx", wsManager.mouseSpeed))
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .monospacedDigit()
                            .frame(width: 34, alignment: .trailing)
                    }
                }

                Button(action: onConnect) {
                    Image(systemName: wsManager.isConnected ? "wifi" : "wifi.slash")
                        .font(.headline)
                        .frame(width: 40, height: 36)
                        .background(Color.white.opacity(0.12))
                        .cornerRadius(10)
                }
                .foregroundStyle(wsManager.isConnected ? .green : .red)

                Button {
                    wsManager.send(["type": "alarm-snooze"])
                } label: {
                    Text("Snooze")
                        .font(.caption.weight(.semibold))
                        .frame(width: 64, height: 36)
                        .background(Color.blue.opacity(0.28))
                        .cornerRadius(10)
                }
                .foregroundStyle(.white)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(.ultraThinMaterial)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .padding(.horizontal, 12)
            .padding(.top, safeAreaTop + 8)

            Spacer()
        }
    }
}
