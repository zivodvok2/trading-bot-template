# Statistical Auto Trader

The former AI tab is now a deterministic automated trader, not an LLM or a trained prediction model. No AI API key is required. Recent-frequency thresholds are experimental rules, not evidence of profitability or next-tick probabilities.

## Workflow

1. Log in normally to Deriv and select a **demo** account.
2. Open Auto Trader (the existing `#ai_trader` bookmark still works), select a market in the live tape, and wait for a full live sample.
3. Choose Even/Odd frequency or Rise/Fall momentum. Set fixed stake, tick duration, entry threshold, cooldown, session net-loss/profit limits, trade count, and consecutive-loss stop.
4. Verify the selected account. The app checks it against Deriv's account response and opens a separate authenticated trading socket. It does not alter Bot Builder's socket.
5. Review and acknowledge the settings. Start once the market sample is ready; the engine can remain armed while waiting for a qualifying signal. For a verified real account, a separate `START REAL` acknowledgement is mandatory.
6. Once armed, the engine requests a quote, rechecks the feed and account, purchases once, waits for settlement, updates the journal, and repeats if limits allow.

## Execution boundaries

- One contract at a time; fixed stake only. The next full stake is reserved against the remaining **net session loss** budget.
- Stops at the selected trade count, consecutive-loss count, net-loss boundary or profit target. Profits/losses from other activities are not counted.
- Stops new entries when the tab is hidden, panel is closed, feed is stale, account/market changes, Bot Builder runs, or the trading socket is unavailable. No unattended background/server worker is installed.
- Stop is not a sell instruction. An already-purchased contract continues at Deriv; settlement is monitored while this panel remains connected.
- A browser Web Lock prevents another Auto Trader session in the same browser/account. This is not a global lock across devices or an account-wide restriction on manual trades.
- Before purchase, a pending marker is saved locally with no credentials. An uncertain buy is never retried automatically. Known contract IDs can be checked using **Check settlement**. If the server never returned an ID, the account remains locked in this feature: verify the Deriv statement and obtain support to reconcile the marker. Do not simply repeat the buy.
- Browser/site data deletion loses local pending markers. Do not clear site data during an unresolved session.
- The journal is limited to 150 entries and can be exported as JSON. Treat exports as private account activity.

## Verification

Unit/component tests use mocked brokerage responses. Public market data and read-only proposals can be checked without buying. Live account-backed demo/real purchases have **not** been exercised by the coding agent. Validate on demo with minimum limits before considering real funds. No profitability claims or backtest results are supplied.

The production build includes the feature; there is no paid provider, secret model key, or additional backend to configure. Existing Deriv OAuth and account permissions must work. A static preview cannot authenticate on an unregistered OAuth redirect URL; use the configured development/deployment origin.

Request shapes follow the app's Options API (`underlying_symbol` on proposals; proposal-ID buy; `proposal_open_contract` settlement polling):
- https://developers.deriv.com/docs/trading/proposal/
- https://developers.deriv.com/docs/trading/buy/

Risk-critical regression tests cover stale samples, fixed-stake validation, trade budgets, no orders before arming, stop-during-quote, duplicate-tick exclusion, uncertain-buy lockout, and settlement after Stop.
