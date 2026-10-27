"""Reproduce the supplied synthetic examples; retain archived replay provenance.

Run: .venv/bin/python build_data.py [--source /path/to/two_step_decomp_from_lin]
Only numerical examples are rerun here, not the proprietary PassengerSim engine.
"""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from scipy.optimize import brentq, minimize
from scipy.special import softmax, xlogy

ROOT = Path(__file__).resolve().parents[2]
M0 = 1000
PI = np.array([.06, .10, .14, .18, .18, .16, .11, .07])
EDGES = np.array([78, 62, 48, 36, 26, 18, 10, 6, 0])
A = (EDGES[:-1] + EDGES[1:]) / 2
Z = PI @ A - A
V, THETA = np.log(1.3), -.03


def tilt(theta):
    return softmax(np.log(PI) + np.asarray(theta)[..., None] * Z, axis=-1)


def exposure(t):
    return np.clip((EDGES[:-1] - np.asarray(t)[..., None]) / -np.diff(EDGES), 0, 1)


def fit(y, i):
    if y.sum() <= 0:
        return None
    o = i > 0
    target = y @ Z / y.sum()
    if not Z[o].min() < target < Z[o].max():
        return None
    def score(th):
        return softmax(np.log(i[o] * PI[o]) + th * Z[o]) @ Z[o] - target
    if score(-2) * score(2) >= 0:
        return None
    th = brentq(score, -2, 2)
    v = np.log(y.sum() / (M0 * (i @ tilt(th))))
    return [float(v), float(th)]


def pooled(y, i, ridge, pool):
    # Rescale theta to beta=100*theta for conditioning; the loss is unchanged.
    # lambda_theta=10000 becomes 1 on beta; lambda_v=100 stays 100.
    raw = [fit(yy, ii) for yy, ii in zip(y, i)]
    initial = np.array([p or [0., 0.] for p in raw]).T
    initial[1] *= 100
    n = len(y)
    def objective(p):
        v, beta = p.reshape(2, n)
        mix = tilt(beta / 100)
        mu = i * M0 * np.exp(v[:, None]) * mix
        r = mu - y
        gv = r.sum(axis=1)
        gb = (r * (Z - (mix @ Z)[:, None])).sum(axis=1) / 100
        cost = (mu - xlogy(y, np.maximum(mu, 1e-300))).sum()
        grad = np.array([gv, gb])
        for j, weight in enumerate([100., 1.]):
            arr = [v, beta][j]
            diff = np.diff(arr)
            cost += ridge * weight * (arr @ arr) + pool * weight * (diff @ diff)
            grad[j] += 2 * ridge * weight * arr
            grad[j, :-1] -= 2 * pool * weight * diff
            grad[j, 1:] += 2 * pool * weight * diff
        return cost, grad.ravel()
    result = minimize(objective, initial.ravel(), jac=True, method='L-BFGS-B',
                      options={'maxiter': 5000, 'ftol': 1e-14, 'gtol': 1e-7})
    assert result.success, result.message
    p = result.x.reshape(2, n).T
    p[:, 1] /= 100
    return p, {'success': bool(result.success), 'iterations': result.nit,
               'gradient_max': float(np.abs(result.jac).max())}


def native(x):
    if isinstance(x, np.ndarray):
        return native(x.tolist())
    if isinstance(x, np.generic):
        return native(x.item())
    if isinstance(x, float):
        assert np.isfinite(x)
        return round(x, 9)
    if isinstance(x, dict):
        return {k: native(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [native(v) for v in x]
    return x


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path)
    args = parser.parse_args()
    i = np.array([1., 1, 1, 1, .5, 0, 0, 0])
    truth = M0 * np.exp(V) * tilt(THETA)
    y = np.random.default_rng(1).poisson(i * truth)
    v, th = fit(y, i)
    flat_v = np.log(y.sum() / (M0 * (i @ PI)))
    sample = {'exposure': i, 'counts': y, 'fit': [v, th], 'flat_v': flat_v,
              'truth': truth, 'fitted': M0 * np.exp(v) * tilt(th),
              'flat': M0 * np.exp(flat_v) * PI, 'seed': 1}

    t = np.arange(3, 73)
    ii = exposure(t)
    event = (t >= 25) & (t < 35)
    vv, tt = V * event, THETA * event
    yy = np.random.default_rng(2).poisson(ii * M0 * np.exp(vv[:, None]) * tilt(tt))
    variants, diagnostics, penalties = {}, {}, {}
    for name, ridge, pool in [('ridge', 1, 0), ('light', .25, .25),
                             ('pooled', 1, 1), ('strong', 4, 4)]:
        variants[name], diagnostics[name] = pooled(yy, ii, ridge, pool)
        penalties[name] = {'volume_ridge': 100 * ridge, 'timing_ridge': 10000 * ridge,
                           'volume_pool': 100 * pool, 'timing_pool': 10000 * pool}

    kernel = np.exp(-.5 * ((np.arange(8) - 3) / .9) ** 2)
    kernel /= kernel.sum()
    promo_mix = (PI + .3 * kernel) / 1.3
    promo_true = M0 * 1.25 * promo_mix
    promo_y = np.random.default_rng(7).poisson(i * promo_true)
    pv, pt = fit(promo_y, i)
    promo = {'counts': promo_y, 'truth': promo_true, 'fit': [pv, pt],
             'fitted': M0 * np.exp(pv) * tilt(pt), 'seed': 7}

    # Complete visible BOS-ORD table from Part 2, E6. Fractions, not percentages.
    # This is an archived single-run, capped, unpooled experiment, not the toy fit.
    replay = {
        'days': [63, 56, 49, 42, 35, 31, 28, 24, 21, 17, 14, 10, 7, 5, 3, 1],
        'shocked': {
            'fit': [.162, .143, .374, .293, .227, .176, .145, .116, .103, .071, .054, .045, .035, .029, .019, .009],
            'baseline': [.162, .143, .180, .194, .201, .209, .206, .197, .188, .170, .157, .134, .103, .092, .055, .019]},
        'unshocked': {
            'fit': [.033, .036, .478, .409, .299, .199, .184, .122, .110, .084, .066, .050, .042, .036, .025, .011],
            'baseline': [.033, .036, .035, .032, .034, .031, .029, .028, .029, .028, .026, .025, .024, .024, .020, .010]},
        'source': 'Archived total-shopping error table',
        'metric': 'Median absolute percentage error of total shops; weighted baseline; one simulated market',
        'benchmark': 'Observed shops plus baseline remaining shops',
        'scope': 'Archived simulation output, one trial; no pooled fit; not a revenue experiment',
    }
    data = {'baseline': {'total': M0, 'mix': PI, 'edges': EDGES, 'midpoints': A, 'score': Z},
            'sample': sample, 'promo': promo,
            'departures': {'days': t, 'exposure': ii, 'counts': yy,
                           'truth': np.array([vv, tt]).T,
                           'raw': [fit(y, i) for y, i in zip(yy, ii)],
                           'variants': variants, 'diagnostics': diagnostics,
                           'penalties': penalties, 'seed': 2},
            'replay': replay}
    target = ROOT / 'assets/data/two-step/demo.json'
    target.write_text(json.dumps(native(data), separators=(',', ':'), allow_nan=False) + '\n')
    provenance = {'generator': '_tools/two-step-demo/build_data.py',
                  'synthetic': ['sample: seed 1', '70 departures: seed 2', 'promo: seed 7'],
                  'adaptations': ['Analytic gradient and rescaled timing parameter for pooled optimization.',
                                  'Additional penalty settings are illustrations using the same fixed sample.',
                                  'Interactive likelihood slices use noise-free expected counts to isolate identification.',
                                  'The public single-departure estimator uses scalar normalization, adaptive bracketing, and bisection.'],
                  'archived': replay['source'], 'sources': []}
    if args.source:
        private_sources = []
        for index, name in enumerate(['two_step_estimator.py', 'two_step_estimator_with_pooling_shrinkage.py',
                     'two_step_estimator.ipynb', 'two_step_estimator_with_pooling_shrinkage.ipynb',
                     'PaxSim_ShoppingStats_Part1.ipynb', 'PaxSim_Part2_Baseline_Estimation.ipynb',
                     'PassengerSim_DemandShock_Shopping.pdf', 'config/estimation_config.yaml'], start=1):
            source = args.source / name
            record = {'id': f'source-{index:02}', 'sha256': hashlib.sha256(source.read_bytes()).hexdigest()}
            provenance['sources'].append(record)
            private_sources.append(dict(record, file=name))
        # Original filenames stay in the build tools, which the site excludes.
        (Path(__file__).parent / 'source-audit.json').write_text(json.dumps(private_sources, indent=2) + '\n')
        # Check every archived table value against the notebook's actual text output.
        nb = json.loads((args.source / 'PaxSim_Part2_Baseline_Estimation.ipynb').read_text())
        text = '\n'.join(''.join(o.get('text', [])) + ''.join(o.get('data', {}).get('text/plain', []))
                         for c in nb['cells'] for o in c.get('outputs', []))
        lines = [line for line in text.splitlines() if len(line.split()) == 9]
        for idx, day in enumerate(replay['days']):
            candidates = [line.split() for line in lines if line.split()[:2] == [str(idx + 1), str(day)]]
            expected = [replay['shocked']['fit'][idx], replay['unshocked']['fit'][idx],
                        replay['shocked']['baseline'][idx], replay['unshocked']['baseline'][idx]]
            assert any([float(row[j]) for j in [3, 4, 7, 8]] == expected for row in candidates), (idx, day)
    manifest = target.parent / 'sources.json'
    if not args.source and manifest.exists():
        provenance['sources'] = json.loads(manifest.read_text()).get('sources', [])
    manifest.write_text(json.dumps(provenance, indent=2) + '\n')
    print('Counts', y, 'fit', v, th)
    print('Remaining:', {k: float((1-i) @ sample[k]) for k in ['truth', 'fitted', 'flat']})
    print('Wrote', target, target.stat().st_size, 'bytes')


if __name__ == '__main__':
    main()
