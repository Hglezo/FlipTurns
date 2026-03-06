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
      profiles: {
        Row: {
          id: string
          full_name: string | null
          role: "coach" | "swimmer"
          created_at: string
          swimmer_group: "Sprint" | "Middle distance" | "Distance" | null
        }
        Insert: {
          id: string
          full_name?: string | null
          role: "coach" | "swimmer"
          created_at?: string
          swimmer_group?: "Sprint" | "Middle distance" | "Distance" | null
        }
        Update: {
          id?: string
          full_name?: string | null
          role?: "coach" | "swimmer"
          created_at?: string
          swimmer_group?: "Sprint" | "Middle distance" | "Distance" | null
        }
      }
      workouts: {
        Row: {
          id: string
          date: string
          content: string
          session: string | null
          workout_category: string | null
          assigned_to: string | null
          assigned_to_group: "Sprint" | "Middle distance" | "Distance" | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          date: string
          content?: string
          session?: string | null
          workout_category?: string | null
          assigned_to?: string | null
          assigned_to_group?: "Sprint" | "Middle distance" | "Distance" | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          date?: string
          content?: string
          session?: string | null
          workout_category?: string | null
          assigned_to?: string | null
          assigned_to_group?: "Sprint" | "Middle distance" | "Distance" | null
          created_at?: string
          updated_at?: string
        }
      }
      feedback: {
        Row: {
          id: string
          date: string
          workout_id: string | null
          feedback_text: string | null
          muscle_intensity: number
          cardio_intensity: number
          created_at: string
        }
        Insert: {
          id?: string
          date: string
          workout_id?: string | null
          feedback_text?: string | null
          muscle_intensity: number
          cardio_intensity: number
          created_at?: string
        }
        Update: {
          id?: string
          date?: string
          workout_id?: string | null
          feedback_text?: string | null
          muscle_intensity?: number
          cardio_intensity?: number
          created_at?: string
        }
      }
    }
  }
}
