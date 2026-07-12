// The RevenueCat entitlement identifier was created with U+2024 (ONE DOT
// LEADER) instead of an ASCII period: "get․keipr Pro". Renaming it in RC would
// orphan existing purchases, so every comparison must normalize both sides.
// NFKC folds U+2024 (and other compatibility dots) to ".".
export const PRO_ENTITLEMENT_ID = 'get.keipr Pro'

const normalize = (s: string) => s.normalize('NFKC')

export function hasProEntitlement(activeEntitlements: Record<string, unknown>): boolean {
  const expected = normalize(PRO_ENTITLEMENT_ID)
  return Object.keys(activeEntitlements).some(key => normalize(key) === expected)
}
