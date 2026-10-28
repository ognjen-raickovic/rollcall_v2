// Reviewed, narrow application contract; not a generated copy of private database tables.
type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]
export type CountryRow = {
  id: number
  iso_code: string
  name: string
  enabled: boolean
  created_at: string
}

export type CityRow = {
  id: number
  country_id: number
  country_iso_code: string
  country_name: string
  name: string
  normalized_name: string
  administrative_division: string | null
  admin1_code: string | null
  admin2_code: string | null
  latitude: number | null
  longitude: number | null
  population: number | null
  external_source_id: string | null
}

export type Database = {
  public: {
    Tables: {
      countries: {
        Row: CountryRow
        Insert: never
        Update: never
        Relationships: []
      }
      games: {
        Row: {
          id: number
          name: string
          category: string
          description: string
          min_players: number
          max_players: number
        }
        Insert: never
        Update: never
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      correct_my_username_case: { Args: { p_username: string; p_expected: string }; Returns: Json }
      replace_my_game_experience: { Args: { p_games: Json; p_expected: Json }; Returns: Json }
      prepare_registration: {
        Args: { p_username: string; p_email: string; p_date_of_birth: string; p_fingerprint: string }
        Returns: Json
      }
      my_account_status: { Args: Record<string, never>; Returns: Json }
      suspension_account: { Args: { p_target: string }; Returns: Json }
      change_account_suspension: {
        Args: { p_target: string; p_suspend: boolean; p_reason: string }
        Returns: Json
      }
      get_suspension_audit: {
        Args: { p_target?: string; p_limit: number; p_before?: string }
        Returns: Json
      }
      submit_event_report: {
        Args: { p_event_id: string; p_reason: string; p_description: string | null }
        Returns: Json
      }
      list_event_reports: {
        Args: { p_status: string; p_limit: number; p_before_time?: string; p_before_id?: string }
        Returns: Json
      }
      get_event_report: { Args: { p_report_id: string }; Returns: Json }
      resolve_event_report: {
        Args: { p_report_id: string; p_action: string; p_note: string }
        Returns: Json
      }
      my_permissions: { Args: Record<string, never>; Returns: Json }
      admin_users: { Args: { p_limit: number; p_after?: string; p_user_id?: string }; Returns: Json }
      change_admin_role: { Args: { p_target: string; p_role: string }; Returns: Json }
      admin_role_audit: {
        Args: { p_limit: number; p_before?: string; p_target?: string }
        Returns: Json
      }
      manage_event_invitation: {
        Args: {
          p_event_id: string
          p_hash: string
          p_sealed: string
          p_expires: string
          p_action: string
        }
        Returns: Json
      }
      redeem_event_invitation: { Args: { p_hash: string }; Returns: Json }
      search_cities: {
        Args: { country_code: string; search_query: string; result_limit: number }
        Returns: CityRow[]
      }
      public_profile: { Args: { p_user_id: string }; Returns: Json }
      get_my_profile: { Args: Record<string, never>; Returns: Json }
      update_my_profile: { Args: { p_patch: Json }; Returns: Json }
      set_my_game_experience: { Args: { p_game_id: number; p_experience: string }; Returns: Json }
      remove_my_game_experience: { Args: { p_game_id: number }; Returns: undefined }
      discover_events: { Args: { p_filters: Json }; Returns: Json }
      my_events: { Args: { p_filters: Json }; Returns: Json }
      get_event: { Args: { p_event_id: string }; Returns: Json }
      create_event: { Args: { p_input: Json }; Returns: Json }
      update_event: { Args: { p_event_id: string; p_patch: Json }; Returns: Json }
      delete_event: { Args: { p_event_id: string }; Returns: undefined }
      join_event: { Args: { p_event_id: string }; Returns: Json }
      leave_event: { Args: { p_event_id: string }; Returns: Json }
      reserve_event_cover: { Args: { p_event_id: string }; Returns: Json }
      commit_event_cover: { Args: { p_event_id: string; p_path: string }; Returns: Json }
      abort_event_cover: { Args: { p_event_id: string; p_path: string }; Returns: undefined }
      remove_event_cover: { Args: { p_event_id: string }; Returns: Json }
      get_event_cover: { Args: { p_event_id: string }; Returns: Json }
      pending_event_cover_cleanup: { Args: { p_event_id: string }; Returns: Json }
      complete_event_cover_cleanup: { Args: { p_path: string }; Returns: undefined }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
