import { z } from 'zod'
import {
  personaSchema,
  type Persona,
} from '@cove/shared'

/**
 * Facts the responder may quote. They never travel to the browser.
 */
const internalPersonaSchema = personaSchema.extend({
  aliases: z.array(z.string().min(1)),
  facts: z.object({
    order: z.string().min(1),
    returns: z.string().min(1),
    billing: z.string().min(1).nullable(),
  }),
})

/** Shopper record used by order lookup. The public fields are a subset. */
export type InternalPersona = z.infer<typeof internalPersonaSchema>

const catalog = internalPersonaSchema.array().parse([
  {
    id: 'avery',
    name: 'Avery Chen',
    email: 'avery@northline.example',
    city: 'Portland, OR',
    memberSince: '2022',
    aliases: ['parka', 'trailhead', 'nl-10482'],
    order: {
      id: 'NL-10482',
      item: 'Trailhead Parka',
      detail: 'Size M · Cedar',
      status: 'Out for delivery',
      statusNote: 'On a UPS truck in Portland. Window: today by 8pm.',
      total: '$248',
    },
    facts: {
      order:
        'Order NL-10482, the Trailhead Parka in size M ($248), is out for delivery. UPS handed it to a driver in Portland this morning, with a window of today by 8pm.',
      returns:
        'This parka has not been delivered yet, so a return opens once it arrives. The carrier already has it on the truck, so an address change would be an intercept, not a warehouse edit.',
      billing: null,
    },
    suggestedPrompts: [
      'Where is order NL-10482?',
      'Can I change the delivery address?',
      'Talk to a person',
    ],
  },
  {
    id: 'jordan',
    name: 'Jordan Hale',
    email: 'jordan@northline.example',
    city: 'Austin, TX',
    memberSince: '2024',
    aliases: ['boots', 'ridgeline', 'nl-10311'],
    order: {
      id: 'NL-10311',
      item: 'Ridgeline Boots',
      detail: 'Size 9 · Slate',
      status: 'Delivered',
      statusNote: 'Delivered 12 days ago. Still inside the 30-day window.',
      total: '$189',
    },
    facts: {
      order: 'Order NL-10311, the Ridgeline Boots in size 9 ($189), was delivered 12 days ago.',
      returns:
        'Those Ridgeline Boots were delivered 12 days ago, which is inside the 30-day return window. A prepaid label by email is the usual path.',
      billing: null,
    },
    suggestedPrompts: [
      'Can I return the Ridgeline Boots?',
      'How do size exchanges work?',
      'What does the warranty cover?',
    ],
  },
  {
    id: 'sam',
    name: 'Sam Okonkwo',
    email: 'sam@northline.example',
    city: 'Chicago, IL',
    memberSince: '2021',
    aliases: ['trail club', 'membership', 'renewal'],
    order: {
      id: 'NL-CLUB',
      item: 'Trail Club annual',
      detail: 'Renewed Oct 18',
      status: 'Renewed',
      statusNote: 'Two $79 charges posted on Oct 18. One is a duplicate.',
      total: '$79',
    },
    facts: {
      order: 'Trail Club annual membership renewed on Oct 18 for $79.',
      returns: 'Membership fees follow the billing note rather than the gear return window.',
      billing:
        'Two charges of $79 posted on Oct 18 under the descriptor NORTHLINE*CLUB. One is a duplicate, and the extra charge is marked for reversal within two business days. Membership stays active while it reverses.',
    },
    suggestedPrompts: [
      'Why was I charged twice?',
      'How does Trail Club billing work?',
      'Talk to a person',
    ],
  },
])

/**
 * Returns every demo shopper, without server-only facts.
 *
 * @returns Public persona records for the storefront.
 */
export function listPublicPersonas(): Persona[] {
  return catalog.map((persona) => personaSchema.parse(persona))
}

/**
 * Looks up a demo shopper, including answer facts.
 *
 * @param personaId - Id from the storefront switcher.
 * @returns The internal record, or `undefined` when the id is unknown.
 */
export function getPersona(personaId: string): InternalPersona | undefined {
  return catalog.find((persona) => persona.id === personaId)
}
