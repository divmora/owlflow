# Changelog

## [0.3.0](https://github.com/divmora/owlflow/compare/v0.2.0...v0.3.0) (2026-10-05)


### Features

* **connectors:** expand HTTP connector with POST/PUT/DELETE, custom headers, timeout, and SSRF guards ([#41](https://github.com/divmora/owlflow/issues/41)) ([3c00169](https://github.com/divmora/owlflow/commit/3c0016906bdc8ed5d36b61f433cb98e7e3eda5a4)), closes [#27](https://github.com/divmora/owlflow/issues/27)
* **deploy:** add CloudFormation templates for AWS Lambda and ECS Fargate ([5529199](https://github.com/divmora/owlflow/commit/552919969d2030557e93a626a164148d6ba7c31b))
* **deploy:** provide production deployment manifests and health probes for Kubernetes ([#34](https://github.com/divmora/owlflow/issues/34)) ([24648e1](https://github.com/divmora/owlflow/commit/24648e17796909190001927c44c38126b7593663)), closes [#30](https://github.com/divmora/owlflow/issues/30)
* **docker:** add separate Dockerfile.lambda and optimize standalone container ([eb1322f](https://github.com/divmora/owlflow/commit/eb1322f6017a0b6c4ce9299bcb18aa42c8c8ae86))


### Bug Fixes

* **connectors:** safe parameter extraction and invoke connector validation ([#35](https://github.com/divmora/owlflow/issues/35)) ([844dc66](https://github.com/divmora/owlflow/commit/844dc66102226ac5fa21f973982b3a7223a95be4)), closes [#22](https://github.com/divmora/owlflow/issues/22)
* **core:** enforce step timeout configuration during execution ([#26](https://github.com/divmora/owlflow/issues/26)) ([#37](https://github.com/divmora/owlflow/issues/37)) ([c2fe83a](https://github.com/divmora/owlflow/commit/c2fe83a5a77b57e9dc30135e51ab5f77ef459b03))
* **core:** execute step when retries=0 and preserve root cause errors ([#21](https://github.com/divmora/owlflow/issues/21)) ([#36](https://github.com/divmora/owlflow/issues/36)) ([250566b](https://github.com/divmora/owlflow/commit/250566b4af1a5ed2181bb0b78aff07cc93a5cc19))
* **core:** prevent runtime panics on missing initial_step and invalid step dereferences ([#32](https://github.com/divmora/owlflow/issues/32)) ([380c2e0](https://github.com/divmora/owlflow/commit/380c2e0ae6b8cea7d32326ded8238becd8368b22)), closes [#20](https://github.com/divmora/owlflow/issues/20)
* **core:** prevent slice index panic and handle numeric types in indexAccess ([#24](https://github.com/divmora/owlflow/issues/24)) ([#38](https://github.com/divmora/owlflow/issues/38)) ([5303d86](https://github.com/divmora/owlflow/commit/5303d86f8be407092a3d860a42ba499e2c2e0a6d))
* **core:** quote-aware condition expression tokenizer and deterministic regex operands ([#42](https://github.com/divmora/owlflow/issues/42)) ([641b377](https://github.com/divmora/owlflow/commit/641b3779c6fd3e6c63f7b16743528695e1ff1c97)), closes [#25](https://github.com/divmora/owlflow/issues/25)
* **scheduler:** accept standard 5-field and 6-field cron expressions and support workflow unregistration ([#33](https://github.com/divmora/owlflow/issues/33)) ([5d1b39a](https://github.com/divmora/owlflow/commit/5d1b39ab7c065d57b2d490c550828020057c2bc7)), closes [#23](https://github.com/divmora/owlflow/issues/23)
* **server:** cache request body to prevent double read on authenticated HMAC webhooks ([#39](https://github.com/divmora/owlflow/issues/39)) ([db36633](https://github.com/divmora/owlflow/commit/db3663332707a5f7b304b441a3b738d131bbc29e)), closes [#19](https://github.com/divmora/owlflow/issues/19)
* **server:** sanitize webhook ID against path traversal and use constant-time secret comparison ([#31](https://github.com/divmora/owlflow/issues/31)) ([7ac3b30](https://github.com/divmora/owlflow/commit/7ac3b30c0d28f8c9819fe6f59fb2d5ecc27dd375)), closes [#28](https://github.com/divmora/owlflow/issues/28)

## [0.2.0](https://github.com/divmora/owlflow/compare/v0.1.0...v0.2.0) (2026-09-06)


### Features

* initial release of OwlFlow automation engine under BSL 1.1 ([021523e](https://github.com/divmora/owlflow/commit/021523e25fd92dba44c00ad0e5c478dc7e5b2cbc))
