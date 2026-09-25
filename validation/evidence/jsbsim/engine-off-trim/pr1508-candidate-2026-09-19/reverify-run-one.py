"""Run one named test from a JSBSim python test script, per build.

The test scripts call RunTest() at import, which runs the whole case, and
JSBSim_utils resolves fixture paths from sys.argv[0]. Both are set up here so a
single test can be selected while the fixtures still resolve.
"""
import sys, unittest, importlib

SRC_TESTS = "/Users/felg/gh/Felipegalind0/jsbsim/tests"
script, case_name, test_name = sys.argv[1], sys.argv[2], sys.argv[3]

sys.argv = [f"{SRC_TESTS}/{script}.py"]
sys.path.insert(0, SRC_TESTS)

import JSBSim_utils
JSBSim_utils.RunTest = lambda case: None   # keep the import from running all

module = importlib.import_module(script)
case = getattr(module, case_name)
suite = unittest.TestLoader().loadTestsFromNames([test_name], case)
result = unittest.TextTestRunner(verbosity=0).run(suite)
print(f"RESULT {test_name}: "
      f"{'PASS' if result.wasSuccessful() else 'FAIL'} "
      f"(failures={len(result.failures)} errors={len(result.errors)})")
sys.exit(0 if result.wasSuccessful() else 1)
