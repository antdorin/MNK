import SwiftUI
import UIKit

// MARK: – Keyboard capture (UITextField bridge used by ContentView)

struct KeyboardCapture: UIViewRepresentable {
    let wsManager: WebSocketManager
    @Binding var isActive: Bool

    func makeUIView(context: Context) -> UITextField {
        let tf = UITextField()
        tf.borderStyle            = .none
        tf.alpha                  = 0.01
        tf.autocorrectionType     = .no
        tf.autocapitalizationType = .none
        tf.spellCheckingType      = .no
        tf.smartQuotesType        = .no
        tf.smartDashesType        = .no
        tf.delegate               = context.coordinator
        tf.text                   = " "   // sentinel so backspace is detectable
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
            return false
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
