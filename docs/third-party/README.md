# Third-party license inventory

The two runtime reports are generated from the pinned Receita Federal POMs (Regular 1.7.2 and Simples 1.0.2 at the pinned commit)
with `org.codehaus.mojo:license-maven-plugin:2.9.0:add-third-party`, excluding
`test` and `provided` scopes. They describe Maven metadata as of 19 November
2026; they are an inventory, not a legal opinion or proof of all obligations.
The reports include transitive runtime dependencies, not the Maven build
plugins, JDK/container base-image contents, system packages, or npm packages.
The project does not publish or redistribute the generated Docker images.

The metadata includes Hibernate ORM components declaring LGPL 2.1 or later,
Logback modules declaring EPL-2.0 and LGPL-2.1-only, and Jakarta APIs declaring
EPL 2.0 and GPL 2 with Classpath Exception. Review the actual license texts and
any applicable conditions before distributing images or binaries; multiple
names in POM metadata do not by themselves establish the choice of license.

The Java engine projects themselves contain MIT license files. Direct npm
runtime dependencies declare MIT (`lossless-json`, `proper-lockfile`) or
BlueOak-1.0.0 (`tar`); their transitive packages declare MIT, ISC or
BlueOak-1.0.0 in npm metadata. See the [npm runtime inventory](npm-runtime-licenses.md) for exact versions and license files. `package-lock.json` records npm package versions
and integrity values. Development dependencies and build-time artifacts require
separate review when preparing a release.
