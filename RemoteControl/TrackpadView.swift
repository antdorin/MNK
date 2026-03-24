import SwiftUI
import UIKit

// MARK: – Full-screen trackpad using UIKit gesture recognizers
//  • 1-finger tap      → left click
//  • 1-finger double   → right click
//  • 1-finger drag     → mouse move  (velocity scaled by wsManager.mouseSpeed)
//  • 2-finger drag     → scroll

struct TrackpadView: UIViewRepresentable {
    @EnvironmentObject var wsManager: WebSocketManager

    func makeUIView(context: Context) -> UIView {
        let view = UIView()
        view.backgroundColor = UIColor(wsManager.trackpadColor)
        view.isMultipleTouchEnabled = true

        // Double tap (must be registered first so single can require-fail it)
        let doubleTap = UITapGestureRecognizer(
            target: context.coordinator,
            action: #selector(Coordinator.handleDoubleTap))
        doubleTap.numberOfTapsRequired    = 2
        doubleTap.numberOfTouchesRequired = 1

        // Single tap
        let singleTap = UITapGestureRecognizer(
            target: context.coordinator,
            action: #selector(Coordinator.handleSingleTap))
        singleTap.numberOfTapsRequired    = 1
        singleTap.numberOfTouchesRequired = 1
        singleTap.require(toFail: doubleTap)

        // 1-finger pan → mouse move
        let movePan = UIPanGestureRecognizer(
            target: context.coordinator,
            action: #selector(Coordinator.handleMovePan))
        movePan.minimumNumberOfTouches = 1
        movePan.maximumNumberOfTouches = 1
        movePan.delegate = context.coordinator

        // 2-finger pan → scroll
        let scrollPan = UIPanGestureRecognizer(
            target: context.coordinator,
            action: #selector(Coordinator.handleScrollPan))
        scrollPan.minimumNumberOfTouches = 2
        scrollPan.maximumNumberOfTouches = 2
        scrollPan.delegate = context.coordinator

        [doubleTap, singleTap, movePan, scrollPan].forEach { view.addGestureRecognizer($0) }
        return view
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        context.coordinator.wsManager = wsManager
        uiView.backgroundColor = UIColor(wsManager.trackpadColor)
    }

    func makeCoordinator() -> Coordinator { Coordinator(wsManager: wsManager) }

    // MARK: – Coordinator

    class Coordinator: NSObject, UIGestureRecognizerDelegate {
        var wsManager: WebSocketManager
        init(wsManager: WebSocketManager) { self.wsManager = wsManager }

        @objc func handleSingleTap(_ g: UITapGestureRecognizer) {
            wsManager.send(["type": "click", "button": "left"])
        }

        @objc func handleDoubleTap(_ g: UITapGestureRecognizer) {
            wsManager.send(["type": "click", "button": "right"])
        }

        @objc func handleMovePan(_ g: UIPanGestureRecognizer) {
            // Gaming mode: track finger position for floating overlay
            if wsManager.gamingMode {
                switch g.state {
                case .began, .changed:
                    wsManager.gamingTouchLocation = g.location(in: g.view)
                case .ended, .cancelled, .failed:
                    wsManager.gamingTouchLocation = nil
                default: break
                }
            }

            guard g.state == .changed else { return }
            let d = g.translation(in: g.view)
            g.setTranslation(.zero, in: g.view)
            wsManager.send([
                "type": "mousemove",
                "dx":   d.x * wsManager.mouseSpeed,
                "dy":   d.y * wsManager.mouseSpeed
            ])
        }

        @objc func handleScrollPan(_ g: UIPanGestureRecognizer) {
            guard g.state == .changed else { return }
            let d = g.translation(in: g.view)
            g.setTranslation(.zero, in: g.view)
            let amt = Int(d.y / 5)
            if amt != 0 { wsManager.send(["type": "scroll", "dy": amt]) }
        }

        // Allow 1-finger and 2-finger pans to coexist without cancelling each other
        func gestureRecognizer(_ gr: UIGestureRecognizer,
                               shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
            return false
        }
    }
}
