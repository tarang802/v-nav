import { api } from './apiClient.js'

const MAX_PAGES = 20 // 20 × 50 = the server's 1,000-friend cap

/** Every friend of the signed-in user (the list endpoint is paginated). */
export async function fetchAllFriends() {
  const friends = []
  let cursor = null
  for (let page = 0; page < MAX_PAGES; page++) {
    const query = cursor ? `?limit=50&cursor=${encodeURIComponent(cursor)}` : '?limit=50'
    const { items, nextCursor } = await api(`/friends${query}`)
    friends.push(...items)
    if (!nextCursor) break
    cursor = nextCursor
  }
  return friends
}
