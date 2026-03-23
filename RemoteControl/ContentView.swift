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
}
