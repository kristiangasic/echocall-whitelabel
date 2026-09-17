import type { ResellerCustomer } from '../../core/hub/hub.models';
import { customerOption } from './customer-option';

function customer(user: ResellerCustomer['user'], userId: number | null = null): ResellerCustomer {
  return { id: 1, userId, user } as ResellerCustomer;
}

describe('customerOption', () => {
  it('shows the name with the address behind it', () => {
    const option = customerOption(
      customer({ id: 501, email: 'lina@example.com', firstName: 'Lina', lastName: 'Mayer' }, 501),
    );

    expect(option).toEqual({ id: 501, label: 'Lina Mayer (lina@example.com)' });
  });

  it('falls back to the address when there is no name', () => {
    const option = customerOption(
      customer({ id: 502, email: 'timo@example.com', firstName: null, lastName: null }, 502),
    );

    expect(option.label).toBe('timo@example.com');
  });

  it('names the identifier rather than nothing at all', () => {
    const option = customerOption(customer({ id: 503, email: '', firstName: null, lastName: null }));

    expect(option).toEqual({ id: 503, label: '503' });
  });
});
