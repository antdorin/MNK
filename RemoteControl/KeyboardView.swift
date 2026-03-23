import SwiftUI
import UIKit

// MARK: – UITextField wrapper for keyboard capture

struct KeyboardCapture: UIViewRepresentable {
    let wsManager: WebSocketManager
    @Binding var isActive: Bool

    func makeUIView(context: Context) -> UITextField {
        let tf = UITextField()
        tf.borderStyle      = .none
        tf.alpha            = 0.01          // Nearly invisible, still receives input
        tf.autocorrectionType    = .no
        tf.autocapitalizationType = .none
        tf.spellCheckingType     = .no
        tf.smartQuotesType       = .no
        tf.smartDashesType       = .no
        tf.delegate = context.coordinator
        tf.text = " "                       // Sentinel so backspace is detectable
        return tf
    }

    func updateUIView(_ uiView: UITextField, context: Context) {
        context.coordinator.wsManager = wsManager
        context.coordinator.isActive  = _isActive
        if isActive {
            DispatchQueue.main.async { uiView.becomeFirstResponder() }
        } else {
            DispatchQueue.main.async { uiView.resignFirstResponder() }
        }
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(wsManager: wsManager, isActive: _isActive)
    }

    // MARK: Coordinator

    class Coordinator: NSObject, UITextFieldDelegate {
        var wsManager: WebSocketManager
        var isActive:  Binding<Bool>

        init(wsManager: WebSocketManager, isActive: Binding<Bool>) {
            self.wsManager = wsManager
            self.isActive  = isActive
        }

        func textField(_ textField: UITextField,
                       shouldChangeCharactersIn range: NSRange,
                       replacementString string: String) -> Bool {
            // Always reset to sentinel after this event
            DispatchQueue.main.async { textField.text = " " }

            if string.isEmpty {
                wsManager.send(["type": "keydown", "key": "Backspace"])
            } else {
                for char in string {
                    let key: String
                    switch char {
                    case "\n": key = "Return"
                    case "\t": key = "Tab"
                    default:   key = String(char)
                    }
                    wsManager.send(["type": "keydown", "key": key])
                }
            }
            return false    // Don't let iOS change the text field contents
        }

        func textFieldShouldReturn(_ textField: UITextField) -> Bool {
            wsManager.send(["type": "keydown", "key": "Return"])
            return false
        }

        func textFieldDidEndEditing(_ textField: UITextField) {
            isActive.wrappedValue = false
        }
    }
}

// MARK: – KeyboardView

struct KeyboardView: View {
    @EnvironmentObject var wsManager: WebSocketManager
    @State private var isKeyboardActive = false

    private let specialKeys: [(label: String, key: String)] = [
        ("Esc",  "Escape"),    ("Tab",  "Tab"),
        ("⌫",    "Backspace"), ("↵",    "Return"),
        ("↑",    "ArrowUp"),   ("↓",    "ArrowDown"),
        ("←",    "ArrowLeft"), ("→",    "ArrowRight"),
        ("Home", "Home"),      ("End",  "End"),
        ("PgUp", "PageUp"),    ("PgDn", "PageDown"),
    ]

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {

                // ── Status strip ──────────────────────────────────
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

                // ── Invisible keyboard capture field ──────────────
                KeyboardCapture(wsManager: wsManager, isActive: $isKeyboardActive)
                    .frame(width: 1, height: 1)
                    .opacity(0.01)

                // ── Tap-to-type area ──────────────────────────────
                Button {
                    guard wsManager.isConnected else { return }
                    isKeyboardActive.toggle()
                } label: {
                    VStack(spacing: 12) {
                        Image(systemName: isKeyboardActive ? "keyboard.fill" : "keyboard")
                            .font(.system(size: 48))
                            .foregroundStyle(
                                isKeyboardActive ? Color.accentColor : Color.secondary)

                        Text(isKeyboardActive ? "Keyboard Active\nTap here to dismiss" : "Tap to Type")
                            .font(.headline)
                            .multilineTextAlignment(.center)
                            .foregroundStyle(
                                isKeyboardActive ? Color.primary : Color.secondary)
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 160)
                    .background(
                        RoundedRectangle(cornerRadius: 20)
                            .fill(Color(.systemGray6))
                            .overlay(
                                RoundedRectangle(cornerRadius: 20)
                                    .strokeBorder(
                                        isKeyboardActive
                                            ? Color.accentColor
                                            : Color.gray.opacity(0.3),
                                        lineWidth: isKeyboardActive ? 2 : 1
                                    )
                            )
                    )
                }
                .disabled(!wsManager.isConnected)
                .padding(.horizontal, 16)

                // ── Special keys grid ─────────────────────────────
                VStack(alignment: .leading, spacing: 8) {
                    Text("Special Keys")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 16)

                    LazyVGrid(
                        columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 4),
                        spacing: 8
                    ) {
                        ForEach(specialKeys, id: \.key) { item in
                            SpecialKeyButton(label: item.label, key: item.key)
                        }
                    }
                    .padding(.horizontal, 16)
                    .disabled(!wsManager.isConnected)
                }
            }
            .padding(.top, 8)
            .padding(.bottom, 32)
        }
    }
}

// MARK: – Special key button

struct SpecialKeyButton: View {
    @EnvironmentObject var wsManager: WebSocketManager
    let label: String
    let key:   String

    var body: some View {
        Button {
            wsManager.send(["type": "keydown", "key": key])
        } label: {
            Text(label)
                .font(.system(size: 15, weight: .medium))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(Color(.systemGray5))
                .cornerRadius(8)
        }
        .foregroundStyle(.primary)
    }
}
