import type { ResellerCustomer } from '../../../core/hub/hub.models';
import type { AdminUser } from '../../../core/models';

/** Whether the customer may use the service at all. Null when the service did not say. */
export type AccountStatus = 'active' | 'suspended' | 'trial';

/**
 * One line of the customer list: the account as the service knows it, together
 * with the portal login that belongs to it. A customer created before the
 * portal existed has no login, which the list has to show rather than hide.
 */
export interface CustomerRow {
  customerId: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  accountStatus: AccountStatus | null;
  balanceEur: string | null;
  createdAt: string | null;
  login: AdminUser | null;
}

/** Joins the customers of the service with the portal logins, keyed by customer id. */
export function mergeCustomers(customers: ResellerCustomer[], logins: AdminUser[]): CustomerRow[] {
  const byCustomer = new Map<number, AdminUser>();
  for (const login of logins) {
    if (login.echocallCustomerId !== null) byCustomer.set(login.echocallCustomerId, login);
  }
  return customers.map((customer) => {
    const user = customer.user;
    const customerId = customer.userId ?? user?.id ?? 0;
    const login = byCustomer.get(customerId) ?? null;
    return {
      customerId,
      email: user?.email ?? login?.email ?? '',
      firstName: user?.firstName ?? null,
      lastName: user?.lastName ?? null,
      company: user?.company ?? null,
      accountStatus: user?.accountStatus ?? null,
      balanceEur: user?.balanceEur ?? null,
      createdAt: customer.createdAt ?? null,
      login,
    };
  });
}
