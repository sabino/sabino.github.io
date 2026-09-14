# Verso compatibility address

The game source and complete git history are in [sabino/verso](https://github.com/sabino/verso). GitHub Actions publishes its build to [sabino.pro/verso](https://sabino.pro/verso/).

This directory keeps the existing `/games/verso/` URL, installed-app identity and browser saves using the same game build. The readable loader and worker are maintained in `migration/legacy/` in the game repository. Do not copy `dist`, bundles, audio or art here.

See [migration and rollback documentation](https://github.com/sabino/verso/blob/main/docs/REPOSITORY-AND-DEPLOYMENT.md). Original generated payload history remains intact; the pinned migration release also retains the exact prior public files.
