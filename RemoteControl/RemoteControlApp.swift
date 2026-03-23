import SwiftUI

@main
struct RemoteControlApp: App {
    @StateObject private var wsManager = WebSocketManager()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(wsManager)
        }
    }
}
