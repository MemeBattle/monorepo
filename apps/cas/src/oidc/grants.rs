//! Grants seen from other contexts. A grant is one authorization of a client
//! by an account, the root of a chain of refresh tokens (ADR 0011 (d));
//! revoking it — setting `revoked_at` — kills every refresh token under it,
//! and access tokens already out run out on their own within
//! [`super::ACCESS_TOKEN_LIFETIME`].
//!
//! Inside this context a grant is revoked by a replayed code (ADR 0011 (d))
//! or a reused refresh token (ADR 0012 (b)). Other contexts revoke through
//! [`revoke_account_grants`], never through the repository (LAYOUT rule 7).

use uuid::Uuid;

use super::repository;

/// Revokes every live grant of an account, in one statement on the caller's
/// executor, and returns how many there were (ADR 0012 (h)). A grant revoked
/// before keeps the moment it was first revoked.
///
/// It takes an executor rather than opening a transaction, so that the
/// caller revokes in the transaction that decides it: the guest upgrade
/// (#747) calls it with the account row locked, and an account removal that
/// keeps the row must call it too. Deleting the row needs no call: the grants
/// go with it by cascade.
pub async fn revoke_account_grants<'e, E>(executor: E, account_id: Uuid) -> Result<u64, sqlx::Error>
where
    E: sqlx::PgExecutor<'e>,
{
    let revoked = repository::revoke_grants_of_account(executor, account_id).await?;
    tracing::info!(
        account_id = %account_id,
        revoked,
        "grants of the account revoked"
    );
    Ok(revoked)
}

#[cfg(test)]
mod tests {
    use sqlx::PgPool;

    use super::*;
    use crate::oidc::REFRESH_TOKEN_LIFETIME;
    use crate::oidc::repository::tests::{fixture, scope_list};
    use crate::oidc::repository::{NewGrant, insert_grant};

    async fn revoked(pool: &PgPool) -> i64 {
        // Unchecked query: see docs/TESTS.md.
        sqlx::query_scalar("SELECT count(*) FROM grants WHERE revoked_at IS NOT NULL")
            .fetch_one(pool)
            .await
            .unwrap()
    }

    /// The revocation is the caller's transaction's: rolled back, it never
    /// happened; committed, it holds.
    #[sqlx::test]
    async fn the_revocation_rides_the_callers_transaction(pool: PgPool) {
        let fixture = fixture(&pool).await;
        insert_grant(
            &pool,
            NewGrant {
                account_id: fixture.account_id,
                client_id: &fixture.client_id,
                scopes: &scope_list(),
                authorization_code_id: None,
                lifetime: REFRESH_TOKEN_LIFETIME,
            },
        )
        .await
        .unwrap();

        let mut tx = pool.begin().await.unwrap();
        assert_eq!(
            revoke_account_grants(&mut *tx, fixture.account_id)
                .await
                .unwrap(),
            1
        );
        tx.rollback().await.unwrap();
        assert_eq!(revoked(&pool).await, 0);

        let mut tx = pool.begin().await.unwrap();
        revoke_account_grants(&mut *tx, fixture.account_id)
            .await
            .unwrap();
        tx.commit().await.unwrap();
        assert_eq!(revoked(&pool).await, 1);
    }
}
