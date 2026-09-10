# Copy trading compatibility and verification

The copy panel uses Deriv's legacy WebSocket API, separately from the app's newer Options/OAuth connection. Do not substitute the alphanumeric OAuth client ID for a legacy numeric App ID.

## Configuration

1. Register/use your own numeric legacy Deriv App ID and enter it in the copy panel.
2. Authorize an eligible follower account using its own API token with the permissions Deriv requires. Prefer a demo account for validation.
3. Enter the copy token shared by an enabled lead trader. This is not a trader login ID, password, or the follower's own token.
4. Review minimum/maximum trade-stake filters and the follower account. Confirm the acknowledgement before starting.

Tokens are kept in component/connection memory, never persisted to local storage, logged, or sent to an application backend. Switching away closes the connection and clears the component state. Closing the connection DOES NOT stop server-side copying.

## Operations

- `authorize`: authorize the follower.
- `copytrading_list`: retrieve active relationships; requires a confirmed list before starting.
- `copy_start`: send the lead token and minimum/maximum trade-stake filters after explicit review and consent.
- `copy_stop`: stop an active relationship, using its server-returned lead token.
- After start/stop confirmation, refresh the list. An uncertain response requires a manual refresh; mutations are never automatically retried.
- Stake filters are not total-loss caps. Existing open contracts may remain open after stopping.

## Sources and current boundary

Reference: https://github.com/deriv-com/copy-trading (archived), especially `src/hooks/useCopyStart.js`, `useCopyStop.js`, and `useCopyTradersList.js`. Request/response types were checked against the installed `@deriv/api-types` schemas.

The current public Options endpoint returned `UnrecognisedRequest` for a read-only `copytrading_list` probe. Legacy account eligibility and real execution cannot be inferred from this code. No real-money start/stop requests were made during development. Verify with an eligible demo account before enabling real-money use.

Automated tests cover connection request correlation, authorization without starting, review/consent, stake validation, single start request, no retry after timeout, live digits, dashboard navigation, and slow-loader recovery. The production build and focused TypeScript checks pass. Account-backed execution remains unverified without credentials and an appropriate App ID.
