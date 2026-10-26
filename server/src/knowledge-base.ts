import { z } from 'zod'
import {
  publicArticleSchema,
  type PublicArticle,
} from '@cove/shared'

/**
 * Full help article. The storefront only receives the public projection.
 */
export const articleSchema = publicArticleSchema.extend({
  directAnswer: z.string().min(1),
  steps: z.array(z.string().min(1)).min(1),
  keywords: z.array(z.string().min(1)).min(1),
})

/** Help note used by retrieval and by grounded replies. */
export type Article = z.infer<typeof articleSchema>

/** Northline help notes. Written as the source Cove is allowed to quote. */
export const articles: readonly Article[] = articleSchema.array().parse([
  {
    id: 'track-an-order',
    title: 'Track an order',
    category: 'Orders',
    summary: 'Where a shipment stands once Northline prints a label.',
    prompt: 'How do I track an order?',
    directAnswer:
      'Tracking appears on the order page once a label exists. Northline ships from Bend, Oregon, and most addresses see a first carrier scan within two business days of checkout.',
    steps: [
      'Open Orders and sign in with the email from checkout.',
      'Use the carrier link next to the latest shipment.',
      'If there is still no scan after two business days, the desk can chase the carrier.',
    ],
    keywords: ['track', 'tracking', 'shipment', 'carrier', 'scan', 'label', 'package'],
  },
  {
    id: 'change-address',
    title: 'Change a shipping address',
    category: 'Orders',
    summary: 'When an address edit is still possible, and when it becomes an intercept.',
    prompt: 'Can I change my shipping address?',
    directAnswer:
      'A shipping address can be changed until the carrier scans the label. After that scan, the driver has the original address and the desk has to request an intercept.',
    steps: [
      'If the order still says Processing, send the new address in this chat.',
      'If it says Shipped or Out for delivery, ask the desk to request an intercept.',
      'Same-day intercepts are not guaranteed once the package is on a truck.',
    ],
    keywords: ['address', 'change', 'shipping', 'redirect', 'intercept'],
  },
  {
    id: 'cancel-order',
    title: 'Cancel an order',
    category: 'Orders',
    summary: 'Free cancellation while the warehouse has not packed the order.',
    prompt: 'Can I cancel my order?',
    directAnswer:
      'Orders can be cancelled free of charge while they still say Processing. Once a label is scanned, cancellation becomes a return after delivery.',
    steps: [
      'Ask to cancel and include the order number.',
      'The desk stops the warehouse pick if the order has not been packed.',
      'Refunds for a successful cancel return to the original payment method in 3 to 5 business days.',
    ],
    keywords: ['cancel', 'cancellation', 'stop', 'refund', 'processing'],
  },
  {
    id: 'returns-30-days',
    title: 'Returns within 30 days',
    category: 'Returns',
    summary: 'The window, the label, and when the refund posts.',
    prompt: 'How do returns work?',
    directAnswer:
      'Unworn gear can be returned within 30 days of delivery. Northline emails a prepaid label for US addresses. The refund goes to the original payment method after the warehouse checks the item in.',
    steps: [
      'Start the return in this chat or from the order page.',
      'Pack the item with tags on.',
      'Drop it with the carrier printed on the label.',
      'Refunds usually post within 5 business days of check-in.',
    ],
    keywords: ['return', 'refund', '30', 'days', 'label', 'send'],
  },
  {
    id: 'exchanges',
    title: 'Exchange a size',
    category: 'Returns',
    summary: 'How a size swap is timed against the return scan.',
    prompt: 'How do size exchanges work?',
    directAnswer:
      'Size exchanges use the same 30-day window as returns. The replacement ships when the carrier scans the return, not when it is dropped in an unscanned mailbox.',
    steps: [
      'Say which size you need.',
      'Keep the original box if you still have it.',
      'The new size is held for 48 hours while the return starts moving.',
    ],
    keywords: ['exchange', 'size', 'swap', 'different'],
  },
  {
    id: 'trail-club-billing',
    title: 'Trail Club billing',
    category: 'Billing',
    summary: 'Annual renewal, the statement descriptor, and duplicate charges.',
    prompt: 'How does Trail Club billing work?',
    directAnswer:
      'Trail Club is $79 a year. The renewal posts on the anniversary date. A second charge on that same day is treated as a duplicate and reversed within two business days.',
    steps: [
      'Check the descriptor NORTHLINE*CLUB.',
      'If two charges share the same day, wait two business days for the reversal.',
      'Membership benefits stay active while the extra charge reverses.',
    ],
    keywords: ['trail', 'club', 'membership', 'billing', 'charged', 'renewal', 'duplicate', 'fee'],
  },
  {
    id: 'promo-codes',
    title: 'Promo codes',
    category: 'Billing',
    summary: 'Why a code has to be applied before payment.',
    prompt: "Why didn't my promo code work?",
    directAnswer:
      'A promo code has to be applied before you pay. Northline cannot add a code after the order is placed. An unused code can still be used on a later order if it has not expired.',
    steps: [
      'On checkout, open the code field before paying.',
      'If a code fails, it is usually expired or limited to full-price gear.',
      'The desk can tell you which of those it is.',
    ],
    keywords: ['promo', 'code', 'coupon', 'discount', 'checkout'],
  },
  {
    id: 'warranty',
    title: 'Warranty on packs and shells',
    category: 'Product',
    summary: 'What the lifetime warranty covers, and what it treats as wear.',
    prompt: 'What does the warranty cover?',
    directAnswer:
      'Packs and shells carry a lifetime warranty against defects in materials and construction. It does not cover ordinary wear, burns, or fabric that has simply aged on the trail.',
    steps: [
      'Describe the failure.',
      'Send a photo once a person joins the chat.',
      'The desk will repair, replace, or explain why it is wear. The order email counts as proof of purchase.',
    ],
    keywords: ['warranty', 'defect', 'zipper', 'shell', 'pack', 'lifetime', 'repair'],
  },
  {
    id: 'boot-fit',
    title: 'Ridgeline Boot fit',
    category: 'Product',
    summary: 'How the Ridgeline last fits, including between sizes.',
    prompt: 'How should Ridgeline Boots fit?',
    directAnswer:
      'Ridgeline Boots fit true to size for most people. If you are between sizes, choose the larger size. The toe box is narrow.',
    steps: [
      'Measure both feet in the afternoon.',
      'Use the longer foot.',
      'Exchange within 30 days if the larger size still pinches.',
    ],
    keywords: ['boot', 'size', 'fit', 'ridgeline', 'toe', 'sizing'],
  },
  {
    id: 'desk-hours',
    title: 'Desk hours',
    category: 'Account',
    summary: 'When a person is staffed, and what Cove will not do alone.',
    prompt: 'When is the desk staffed?',
    directAnswer:
      'The Northline desk is staffed 8am to 6pm Pacific, seven days. Cove can queue a chat overnight, and a person picks it up at the start of the next day.',
    steps: [
      'Ask Cove for a person at any hour.',
      'Leave the order number in the chat so the desk does not have to ask again.',
      'Carrier intercepts wait for a person. Cove does not contact carriers itself.',
    ],
    keywords: ['hours', 'contact', 'human', 'person', 'desk', 'support', 'staffed'],
  },
])

/**
 * Projects articles down to the storefront contract.
 *
 * @returns Articles without answer steps or keyword lists.
 */
export function listPublicArticles(): PublicArticle[] {
  return articles.map((article) => publicArticleSchema.parse(article))
}
