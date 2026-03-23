import SwiftUI

struct ContentView: View {
    @EnvironmentObject var wsManager: WebSocketManager
    @State private var isKeyboardActive  = false
    @State private var showConnection    = false

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .bottom) {

                // ── Full-screen trackpad ──────────────────────────
                TrackpadView()
                    .environmentObject(wsManager)
                    .ignoresSafeArea()

                // ── Invisible keyboard capture ──────────────────
                if isKeyboardActive {
                    KeyboardCapture(wsManager: wsManager, isActive: $isKeyboardActive)
                        .frame(width: 1, height: 1)
                        .opacity(0.01)
                }

                // ── Top status pill ─────────────────────────────
                VStack {
                    Button { showConnection = true } label: {
                        HStack(spacing: 6) {
                            Circle()
                                .fill(wsManager.isConnected ? Color.green : Color.red)
                                .frame(width: 8, height: 8)
                            Text(wsManager.isConnected ? "Connected" : "Not connected")
                                .font(.caption.weight(.medium))
                            Image(systemName: "chevron.down").font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 7)
                        .background(.ultraThinMaterial)
                        .clipShape(Capsule())
                    }
                    .foregroundStyle(.primary)
                    .padding(.top, geo.safeAreaInsets.top + 10)
                    Spacer()
                }

                // ── Bottom panel ────────────────────────────────
                BottomPanel(
                    safeAreaBottom: geo.safeAreaInsets.bottom,
                    isKeyboardActive: $isKeyboardActive,
                    onConnect: { showConnection = true }
                )
            }
            .ignoresSafeArea()
        }
        .preferredColorScheme(.dark)
        .statusBarHidden(true)
        .sheet(isPresented: $showConnection) {
            NavigationStack {
                ConnectionView()
                    .navigationTitle("Connect")
                    .navigationBarTitleDisplayMode(.inline)
            }
        }
    }
}
