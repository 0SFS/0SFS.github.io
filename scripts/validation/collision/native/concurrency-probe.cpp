// A separate dylib proves that callers observe the interposed libc++ function.
// Calling the replacement directly would not establish that interposition works.
#include <thread>

extern "C" unsigned collision_native_concurrency_probe() {
  return std::thread::hardware_concurrency();
}
