"""Screenshot scaling.

The model sees (and returns coordinates in) the pixel space of the screenshots we send. We shrink
the screen to at most `max_edge` px on the long edge, so every model coordinate must be divided
by `scale` to get a real (logical) screen coordinate. Logical size is what pyautogui clicks in;
the native capture can be larger (HiDPI / Retina), which only matters for `zoom` crops.
"""

from __future__ import annotations

from dataclasses import dataclass

DEFAULT_MAX_EDGE = 1280


@dataclass(frozen=True)
class Geometry:
    logical_w: int
    logical_h: int
    native_w: int
    native_h: int
    max_edge: int = DEFAULT_MAX_EDGE

    @property
    def scale(self) -> float:
        return min(1.0, self.max_edge / max(self.logical_w, self.logical_h))

    @property
    def model_size(self) -> tuple[int, int]:
        return round(self.logical_w * self.scale), round(self.logical_h * self.scale)

    def to_logical(self, x: float, y: float) -> tuple[int, int]:
        """Model-space coordinate -> real screen coordinate, clamped to the screen."""
        lx = round(float(x) / self.scale)
        ly = round(float(y) / self.scale)
        return min(max(lx, 0), self.logical_w - 1), min(max(ly, 0), self.logical_h - 1)

    def to_model(self, x: float, y: float) -> tuple[int, int]:
        return round(float(x) * self.scale), round(float(y) * self.scale)

    def region_to_native(self, region: list[float]) -> tuple[int, int, int, int]:
        """Model-space [x0, y0, x1, y1] -> native-capture crop box, clamped and ordered."""
        x0, y0, x1, y1 = (float(v) for v in region)
        k = (self.native_w / self.logical_w) / self.scale
        left, right = sorted((x0 * k, x1 * k))
        top, bottom = sorted((y0 * k, y1 * k))
        left, top = max(0, round(left)), max(0, round(top))
        right, bottom = min(self.native_w, round(right)), min(self.native_h, round(bottom))
        if right - left < 2 or bottom - top < 2:
            raise ValueError("zoom region is empty or outside the screen")
        return left, top, right, bottom
