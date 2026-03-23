import SwiftUI

struct ConnectionView: View {
    @EnvironmentObject var wsManager: WebSocketManager
    @AppStorage("remoteHost") private var host = ""
    @AppStorage("remotePort") private var port = "9101"

    var body: some View {
        Form {
            Section {
                TextField("IP Address  (e.g. 192.168.1.x)", text: $host)
                    .keyboardType(.numbersAndPunctuation)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)

                TextField("Port  (default: 9101)", text: $port)
                    .keyboardType(.numberPad)
            } header: {
                Text("PC Address")
            } footer: {
                Text("The address is shown in the Alarm Clock app on your PC under \"Remote Control\".")
            }

            Section {
                if wsManager.isConnected {
                    Button("Disconnect", role: .destructive) {
                        wsManager.disconnect()
                    }
                } else {
                    Button("Connect") {
                        wsManager.connect(host: host, port: port)
                    }
                    .disabled(host.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }

            Section("Status") {
                HStack(spacing: 8) {
                    Circle()
                        .fill(wsManager.isConnected ? Color.green : Color.red)
                        .frame(width: 10, height: 10)
                    Text(wsManager.statusMessage)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }
}
