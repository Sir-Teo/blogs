"""Independent objective checks for the fit and the stored pooled solutions."""
import json
from pathlib import Path
import numpy as np
from scipy.optimize import minimize
from scipy.special import xlogy
from build_data import M0, PI, Z, exposure, fit, tilt

data = json.loads((Path(__file__).resolve().parents[2] / 'assets/data/two-step/demo.json').read_text())
i = np.array(data['sample']['exposure'])
for key in ['sample', 'promo']:
    y = np.array(data[key]['counts'])
    v, th = fit(y, i)
    def objective(p):
        vv, beta = p
        mu = i * M0 * np.exp(vv) * tilt(beta / 100)
        return (mu - xlogy(y, np.maximum(mu, 1e-300))).sum()
    # Joint numerical optimization, starting away from the two-step result.
    result = minimize(objective, [0., 0.], method='BFGS', tol=1e-7)
    assert objective([v, 100 * th]) <= result.fun + 1e-6
    assert np.allclose([v, th], [result.x[0], result.x[1] / 100], atol=1e-5)

for day in [55, 40, 22, 3]:
    ii = exposure(day)
    for vv, tt in [(.1, -.025), (-.2, .02), (0., 0.)]:
        yy = ii * M0 * np.exp(vv) * tilt(tt)
        assert np.allclose(fit(yy, ii), [vv, tt], atol=1e-9)

# Evaluate the original (unrescaled) supplied loss independently. A small
# perturbation in any coordinate must not improve the rounded exported fit.
departures = data['departures']
yy, ii = np.array(departures['counts']), np.array(departures['exposure'])
for name, ridge, pool in [('ridge', 1, 0), ('light', .25, .25), ('pooled', 1, 1), ('strong', 4, 4)]:
    p = np.array(departures['variants'][name])
    def loss(pp):
        v, t = pp.T
        mu = ii * M0 * np.exp(v[:, None]) * tilt(t)
        return ((mu - xlogy(yy, np.maximum(mu, 1e-300))).sum()
                + ridge * (100 * v @ v + 10000 * t @ t)
                + pool * (100 * np.diff(v) @ np.diff(v) + 10000 * np.diff(t) @ np.diff(t)))
    center = loss(p)
    for j in range(70):
        for k, delta in [(0, .0001), (1, .000001)]:
            for direction in [-1, 1]:
                perturbed = p.copy()
                perturbed[j, k] += direction * delta
                assert loss(perturbed) >= center - 2e-7, (name, j, k, direction)
    assert departures['diagnostics'][name]['success']

assert data['replay']['shocked']['fit'][2] == .374
assert data['replay']['unshocked']['fit'][2] == .478
assert len(data['replay']['days']) == 16
print('Python checks: joint MLE, noiseless recovery, all pooled objective coordinates, and archived anchors passed.')
