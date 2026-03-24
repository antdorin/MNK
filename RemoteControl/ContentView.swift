import SwiftUI

struct ContentView: View {
    @EnvironmentObject var wsManager: WebSocketManager
    @State private var showConnection    = false

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .bottom) {
                TrackpadView()
                    .environmentObject(wsManager)
                    .ignoresSafeArea()

                // Gaming-mode floating 2-button overlay (follows finger)
                if wsManager.gamingMode, let loc = wsManager.gamingTouchLocation {
                    gamingOverlay(at: loc)
                }

                CustomKeyboardPanel(
                    safeAreaBottom: geo.safeAreaInsets.bottom,
                    onConnect: { showConnection = true }
                )
                .environmentObject(wsManager)
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

    // MARK: – Gaming overlay

    private func gamingOverlay(at location: CGPoint) -> some View {
        HStack(spacing: 16) {
            gamingButton(action: wsManager.gamingButton1, color: .red)
            gamingButton(action: wsManager.gamingButton2, color: .blue)
        }
        .position(x: location.x, y: location.y - 80)
        .animation(.interactiveSpring(response: 0.12, dampingFraction: 0.9), value: location.x)
        .animation(.interactiveSpring(response: 0.12, dampingFraction: 0.9), value: location.y)
    }

    private func gamingButton(action: GamingAction, color: Color) -> some View {
        Button {
            wsManager.executeGamingAction(action)
        } label: {
            Text(action.shortLabel)
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: 56, height: 56)
                .background(color.opacity(0.7))
                .clipShape(Circle())
                .shadow(color: color.opacity(0.5), radius: 6)
        }
        .buttonStyle(.plain)
    }
}
