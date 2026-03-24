import Foundation
import SwiftUI

// MARK: – Gaming-mode button actions

enum GamingAction: String, CaseIterable, Identifiable {
    case leftClick   = "Left Click"
    case rightClick  = "Right Click"
    case middleClick = "Middle Click"
    case doubleClick = "Double Click"
    case scrollUp    = "Scroll Up"
    case scrollDown  = "Scroll Down"

    var id: String { rawValue }

    /// Short label shown inside the floating button
    var shortLabel: String {
        switch self {
        case .leftClick:   return "L"
        case .rightClick:  return "R"
        case .middleClick: return "M"
        case .doubleClick: return "2×"
        case .scrollUp:    return "▲"
        case .scrollDown:  return "▼"
        }
    }
}

class WebSocketManager: NSObject, ObservableObject {

    @Published var isConnected   = false
    @Published var statusMessage = "Not connected"
    @Published var mouseSpeed: Double = 2.0   // drag-delta multiplier (0.5–10.0)
    @Published var gamingMode    = false       // visual toggle, sent with events if needed
    @Published var trackpadColor: Color = .black

    // Gaming-mode overlay
    @Published var gamingButton1: GamingAction = .leftClick
    @Published var gamingButton2: GamingAction = .rightClick
    @Published var gamingTouchLocation: CGPoint? = nil

    private var task: URLSessionWebSocketTask?
    private lazy var session: URLSession = {
        URLSession(configuration: .default, delegate: self, delegateQueue: nil)
    }()

    // MARK: – Connect / Disconnect

    func connect(host: String, port: String) {
        let portStr = port.trimmingCharacters(in: .whitespaces).isEmpty ? "9101" : port
        let hostStr = host.trimmingCharacters(in: .whitespaces)
        guard let url = URL(string: "ws://\(hostStr):\(portStr)") else {
            DispatchQueue.main.async { self.statusMessage = "Invalid address" }
            return
        }
        task?.cancel(with: .goingAway, reason: nil)
        task = session.webSocketTask(with: url)
        task?.resume()
        DispatchQueue.main.async { self.statusMessage = "Connecting…" }
        startReceiving()
    }

    func disconnect() {
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
        DispatchQueue.main.async {
            self.isConnected   = false
            self.statusMessage = "Disconnected"
        }
    }

    // MARK: – Send

    func send(_ dict: [String: Any]) {
        guard isConnected, let task else { return }
        guard let data = try? JSONSerialization.data(withJSONObject: dict),
              let str  = String(data: data, encoding: .utf8) else { return }
        task.send(.string(str)) { _ in }   // fire-and-forget; errors ignored for speed
    }

    // MARK: – Gaming action execution

    func executeGamingAction(_ action: GamingAction) {
        switch action {
        case .leftClick:   send(["type": "click", "button": "left"])
        case .rightClick:  send(["type": "click", "button": "right"])
        case .middleClick: send(["type": "click", "button": "middle"])
        case .doubleClick: send(["type": "click", "button": "left", "double": true])
        case .scrollUp:    send(["type": "scroll", "dy": -3])
        case .scrollDown:  send(["type": "scroll", "dy": 3])
        }
    }

    // MARK: – Receive loop (keeps connection alive + detects drops)

    private func startReceiving() {
        task?.receive { [weak self] result in
            guard let self else { return }
            switch result {
            case .success:
                self.startReceiving()
            case .failure:
                DispatchQueue.main.async {
                    self.isConnected   = false
                    self.statusMessage = "Connection lost"
                }
            }
        }
    }
}

// MARK: – URLSessionWebSocketDelegate

extension WebSocketManager: URLSessionWebSocketDelegate {

    func urlSession(_ session: URLSession,
                    webSocketTask: URLSessionWebSocketTask,
                    didOpenWithProtocol protocol: String?) {
        DispatchQueue.main.async {
            self.isConnected   = true
            self.statusMessage = "Connected"
        }
    }

    func urlSession(_ session: URLSession,
                    webSocketTask: URLSessionWebSocketTask,
                    didCloseWith closeCode: URLSessionWebSocketTask.CloseCode,
                    reason: Data?) {
        DispatchQueue.main.async {
            self.isConnected   = false
            self.statusMessage = "Disconnected"
        }
    }
}
