import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import FriendsOnMap from '../components/map/FriendsOnMap.jsx'
import SharingControl from '../components/map/SharingControl.jsx'
import { useDocumentTitle } from '../hooks/useDocumentTitle.js'
import { fetchAllFriends } from '../services/friends.js'
import { locationStore } from '../stores/locationStore.js'

/** Map home: your sharing control and the friends who are on the map right now. */
export default function MapHome() {
  useDocumentTitle('Campus map')
  const friends = useQuery({ queryKey: ['friends'], queryFn: fetchAllFriends })

  // The map layer reads names from the store, outside React.
  useEffect(() => {
    if (friends.data) locationStore.getState().setDirectory(friends.data)
  }, [friends.data])

  return (
    <>
      <SharingControl />
      <FriendsOnMap loading={friends.isPending} error={friends.isError} />
    </>
  )
}
