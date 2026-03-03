export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      workouts: {
        Row: {
          id: string
          date: string
          content: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          date: string
          content?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          date?: string
          content?: string
          created_at?: string
          updated_at?: string
        }
      }
    }
  }
}
