export interface ShareTag {
  label: string
  color: string
}

export interface ShareSection {
  name: string
  cuisine: string
  badges: string[]
  icon: string | undefined
  restaurant: string
  categories: { name: string; items: { title: string; price: string; description: string; tags: ShareTag[] }[] }[]
}

export interface ShareDayGroup {
  day: string
  sections: ShareSection[]
}

export interface ShareSelectionData {
  days: ShareDayGroup[]
}
