import type { ResellerCustomer } from '../../core/hub/hub.models';

/** One entry of a customer picker. */
export interface CustomerOption {
  id: number;
  label: string;
}

/**
 * How a customer reads in a picker: the name when the hub knows one, the
 * address otherwise, and the identifier when it knows neither, so an entry is
 * never blank and always selectable.
 */
export function customerOption(customer: ResellerCustomer): CustomerOption {
  const user = customer.user;
  const id = customer.userId ?? user?.id ?? 0;
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ');
  const email = user?.email ?? '';
  return { id, label: name ? `${name} (${email})` : email || String(id) };
}
