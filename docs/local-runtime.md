# Local numerical runtime

The static browser app runs its Rust/WASM solver in a dedicated module Worker. Source fitting, checked travel-time curve preparation and linked station paths stay off the UI thread. The main thread owns controls, waveform display, Three.js rendering and one playback clock.

The worker returns an atomic snapshot for a source and station request. Request IDs, cancellation and a main-thread revision check prevent old answers from replacing newer intent. Playback, camera movement and phase selection reuse that snapshot. Calculation cancellation takes effect at bounded checkpoints between synchronous WASM calls. A watchdog rejects a hung job. Retry creates a new owned worker.

A scalar `first_p_time_json(depth,distance)` export reuses the full solver's P roots and shooting equations while omitting other phases and path construction. Base and boundary corpus tests compare it with the earliest P from the full result. The full numerical API, model and frozen tolerances remain in place.

## V8 isolate decision

[V8's embedding guide](https://v8.dev/docs/embed) defines an isolate as a VM instance with its own heap. Embedding one requires a host application. The [Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers) supplies portable background execution in the browser.

This investigation needs local numerical work away from the UI. It has no demonstrated need to execute untrusted user scripts or provide a server runtime. A module Worker satisfies the requirement without adding a native V8 host, installation lifecycle or backend. This is a scope and portability decision, not a measured claim that V8 isolates are slower. Browser Workers are not advertised here as a hostile-code security boundary or as a guaranteed one-to-one V8 isolate mapping across browsers.

An embedded V8 runtime would earn evaluation if a future demonstration needed programmable experiments with explicit execution limits. That capability is absent from this version. No isolate dependency or speculative scripting interface is shipped.
