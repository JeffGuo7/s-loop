# sherpa-onnx's Windows static archives are built with /MT. Keep every CMake
# dependency on the same CRT so Whisper and ONNX Runtime can share one process.
#
# A toolchain file is loaded before CMake has set the `MSVC` variable, so this
# must be assigned unconditionally. Cargo only points at this file for the
# Windows MSVC target.
set(
  CMAKE_POLICY_DEFAULT_CMP0091
  NEW
  CACHE STRING "Select the MSVC runtime through CMake's runtime abstraction" FORCE
)
set(
  CMAKE_MSVC_RUNTIME_LIBRARY
  "MultiThreaded$<$<CONFIG:Debug>:Debug>"
  CACHE STRING "Use the static MSVC runtime" FORCE
)

# whisper-rs currently asks the cmake crate for a Release build while Cargo
# supplies RelWithDebInfo flags. CMake's legacy per-configuration defaults can
# therefore reintroduce /MD for Release unless those configurations are pinned.
foreach(language C CXX)
  set(CMAKE_${language}_FLAGS_DEBUG "/MTd /Zi /Ob0 /Od /RTC1" CACHE STRING "" FORCE)
  set(CMAKE_${language}_FLAGS_RELEASE "/MT /O2 /Ob2 /DNDEBUG" CACHE STRING "" FORCE)
  set(CMAKE_${language}_FLAGS_MINSIZEREL "/MT /O1 /Ob1 /DNDEBUG" CACHE STRING "" FORCE)
  set(CMAKE_${language}_FLAGS_RELWITHDEBINFO "/MT /Zi /O2 /Ob1 /DNDEBUG" CACHE STRING "" FORCE)
endforeach()
