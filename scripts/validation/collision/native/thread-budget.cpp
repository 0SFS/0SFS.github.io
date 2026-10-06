// 0sfs collision benchmark worker cap for CoACD's libc++ std::thread fallback.
// Loaded only into the benchmark Python process by run-coacd.mjs on macOS.
// The runtime uses hardware_concurrency() without a worker-count parameter.
#include <algorithm>
#include <cerrno>
#include <cstdlib>
#include <sys/sysctl.h>
#include <thread>

extern "C" unsigned collision_capped_hardware_concurrency() {
  unsigned cores = 0;
  std::size_t length = sizeof(cores);
  const unsigned maximum = sysctlbyname("hw.logicalcpu", &cores, &length, nullptr, 0) == 0
    ? std::max(1u, cores / 2u) : 1u;
  const char* text = std::getenv("COLLISION_BENCHMARK_THREADS");
  if (!text) return 1;
  char* end = nullptr;
  errno = 0;
  const unsigned long requested = std::strtoul(text, &end, 10);
  if (errno || end == text || *end != '\0' || requested == 0) return 1;
  return static_cast<unsigned>(std::min(static_cast<unsigned long>(maximum), requested));
}

__attribute__((used)) static const struct {
  const void* replacement;
  const void* original;
} interpose __attribute__((section("__DATA,__interpose"))) = {
  reinterpret_cast<const void*>(&collision_capped_hardware_concurrency),
  reinterpret_cast<const void*>(&std::thread::hardware_concurrency)
};
