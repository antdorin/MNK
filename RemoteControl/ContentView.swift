import SwiftUI

struct ContentView: View {
    @EnvironmentObject var wsManager: WebSocketManager

    var body: some View {
        TabView {
            NavigationStack {
                TrackpadView()
                    .navigationTitle("Trackpad")
                    .navigationBarTitleDisplayMode(.inline)
            }
            .tabItem { Label("Trackpad", systemImage: "cursorarrow.motionlines") }

            NavigationStack {
                KeyboardView()
                    .navigationTitle("Keyboard")
                    .navigationBarTitleDisplayMode(.inline)
            }
            .tabItem { Label("Keyboard", systemImage: "keyboard") }

            NavigationStack {
                ConnectionView()
                    .navigationTitle("Connect")
            }
            .tabItem {
                Label("Connect",
                      systemImage: wsManager.isConnected ? "wifi" : "wifi.slash")
            }
        }
    }
}
