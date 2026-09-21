import type { MediaItem, PaginationMeta } from '../../utils/contracts'

export type TmdbResult = {
  id: number
  media_type?: 'movie' | 'tv' | 'person' | string
  title?: string
  name?: string
  release_date?: string
  first_air_date?: string
  poster_path?: string | null
  backdrop_path?: string | null
  overview?: string
}

export type TmdbPage = {
  page: number
  total_pages: number
  total_results: number
  results: TmdbResult[]
}

export type TmdbRatingResponse = {
  results: Array<{
    iso_3166_1?: string
    release_dates?: Array<{ certification?: string }>
    rating?: string
  }>
}

export type NormalizedPage = {
  data: MediaItem[]
  meta: PaginationMeta
}

export type TmdbClient = {
  trending(page?: number): Promise<NormalizedPage>
  discoverMovies(page?: number): Promise<NormalizedPage>
  discoverTv(page?: number): Promise<NormalizedPage>
  searchMulti(query: string, page?: number): Promise<NormalizedPage>
  movieDetails(id: number): Promise<MediaItem>
  tvDetails(id: number): Promise<MediaItem>
  movieRatings(id: number): Promise<TmdbRatingResponse>
  tvRatings(id: number): Promise<TmdbRatingResponse>
}
