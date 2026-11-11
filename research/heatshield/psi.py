"""Physiological Strain Index (Moran DS, Shitzer A, Pandolf KB 1998, Am J Physiol 275:R129).

PSI = 5*(Tc_t - Tc_0)/(39.5 - Tc_0) + 5*(HR_t - HR_0)/(180 - HR_0), scaled 0-10.
0-2 none/little, 3-4 low, 5-6 moderate, 7-8 high, 9-10 very high strain.
"""


def psi(tc: float, hr: float, tc0: float = 37.0, hr0: float = 70.0) -> float:
    a = 5.0 * (tc - tc0) / (39.5 - tc0)
    b = 5.0 * (hr - hr0) / (180.0 - hr0)
    return max(0.0, min(10.0, a + b))


def psi_band(value: float) -> str:
    if value < 3:
        return "none"
    if value < 5:
        return "low"
    if value < 7:
        return "moderate"
    if value < 9:
        return "high"
    return "very_high"
