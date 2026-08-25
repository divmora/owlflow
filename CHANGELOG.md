# Changelog

## [0.1.3](https://github.com/divmora/owlflow/compare/v0.1.2...v0.1.3) (2026-08-24)


### Features

* **connectors:** add jira.check_user_comment and jira.get_comments actions with conditional workflow support ([772460d](https://github.com/divmora/owlflow/commit/772460ddd9b37904eede20b304d302c9567d8f19))
* **core,ui:** add native regexMatch and matches support to condition engine ([8a3a95c](https://github.com/divmora/owlflow/commit/8a3a95c32c90061cb4e299ef0d1da41b8fdb46eb))
* **core:** add unary negation, relational operators, and template helpers to condition evaluator ([152e5a5](https://github.com/divmora/owlflow/commit/152e5a5636602aecbd196205fc7543d84d57a2ff))
* **docs:** add automated GitHub Pages documentation site with llms.txt & llms-full.txt AI endpoints ([5420d69](https://github.com/divmora/owlflow/commit/5420d69cd12f59d9ea8ec3bb34b8497b44dccd1e))
* **gitlab:** add gitlab.check_mr_commit_author and gitlab.get_mr_commits actions with conditional workflow support ([6db0db3](https://github.com/divmora/owlflow/commit/6db0db30ed9e4737dff871bc21b383df5d8d803c))
* **jira:** add diagnostic logging and service account fallback matching to check_user_comment ([134a267](https://github.com/divmora/owlflow/commit/134a267e60c4683cec565128bef32b2232354f13))
* **logging:** format all application and connector logs as structured JSON lines ([b91deca](https://github.com/divmora/owlflow/commit/b91deca5689be6c2fb3a9c307c8772a593f49387))
* **pages,ui:** add GitHub Pages automated deployment and interactive in-app documentation guide ([959066c](https://github.com/divmora/owlflow/commit/959066cbfd6e07ccc4684fbcd77615c82abfc5ea))


### Bug Fixes

* **logging:** ensure all Executor step logs, Gin server logs, and connectors route through Syslog when enabled ([946c2e7](https://github.com/divmora/owlflow/commit/946c2e78140ab7fd4b6a7e10b1d089209b46358c))

## [0.1.2](https://github.com/divmora/owlflow/compare/v0.1.1...v0.1.2) (2026-08-20)


### Features

* initial commit for owlflow automation engine ([fe40ab7](https://github.com/divmora/owlflow/commit/fe40ab70eb8a4a4af3ff93f667c9c6a0f370bce1))
* **ui:** add standalone OwlFlow developer UI, docker-compose, deepwiki badge, and agent docs ([d7d3e26](https://github.com/divmora/owlflow/commit/d7d3e26f6a853246a2e54e82c6f8423858b15a31))


### Bug Fixes

* **release:** disable package component prefix in release-please tags ([f2b3c74](https://github.com/divmora/owlflow/commit/f2b3c7424743c4de74c903b9a9cf078fe95528ad))

## [0.1.1](https://github.com/divmora/owlflow/compare/github.com/divmora/owlflow-v0.1.0...github.com/divmora/owlflow-v0.1.1) (2026-08-20)


### Features

* initial commit for owlflow automation engine ([fe40ab7](https://github.com/divmora/owlflow/commit/fe40ab70eb8a4a4af3ff93f667c9c6a0f370bce1))
* **ui:** add standalone OwlFlow developer UI, docker-compose, deepwiki badge, and agent docs ([d7d3e26](https://github.com/divmora/owlflow/commit/d7d3e26f6a853246a2e54e82c6f8423858b15a31))
