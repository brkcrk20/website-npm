export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      categories: {
        Row: {
          created_at: string
          icon: string | null
          id: string
          is_active: boolean
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
        }
        Relationships: []
      }
      community_posts: {
        Row: {
          author_id: string
          comments_count: number
          content: string
          created_at: string
          id: string
          likes_count: number
          tags: string[]
          title: string
          trade_co2_saved: number | null
          trade_item_given: string | null
          trade_item_received: string | null
        }
        Insert: {
          author_id: string
          comments_count?: number
          content: string
          created_at?: string
          id?: string
          likes_count?: number
          tags?: string[]
          title: string
          trade_co2_saved?: number | null
          trade_item_given?: string | null
          trade_item_received?: string | null
        }
        Update: {
          author_id?: string
          comments_count?: number
          content?: string
          created_at?: string
          id?: string
          likes_count?: number
          tags?: string[]
          title?: string
          trade_co2_saved?: number | null
          trade_item_given?: string | null
          trade_item_received?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          active_trade_offer_id: string | null
          created_at: string
          id: string
          participant_one_id: string
          participant_two_id: string
          related_listing_id: string | null
          updated_at: string
        }
        Insert: {
          active_trade_offer_id?: string | null
          created_at?: string
          id?: string
          participant_one_id: string
          participant_two_id: string
          related_listing_id?: string | null
          updated_at?: string
        }
        Update: {
          active_trade_offer_id?: string | null
          created_at?: string
          id?: string
          participant_one_id?: string
          participant_two_id?: string
          related_listing_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_active_trade_offer_id_fkey"
            columns: ["active_trade_offer_id"]
            isOneToOne: false
            referencedRelation: "trade_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_participant_one_id_fkey"
            columns: ["participant_one_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_participant_two_id_fkey"
            columns: ["participant_two_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_related_listing_id_fkey"
            columns: ["related_listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites: {
        Row: {
          created_at: string
          id: string
          listing_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          listing_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          listing_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      impact_records: {
        Row: {
          calculated_at: string
          co2e_kg: number
          energy_kwh: number
          id: string
          material_kg: number
          methodology_version: string
          reuse_count: number
          trade_id: string
          waste_kg: number
          water_liters: number
        }
        Insert: {
          calculated_at?: string
          co2e_kg?: number
          energy_kwh?: number
          id?: string
          material_kg?: number
          methodology_version?: string
          reuse_count?: number
          trade_id: string
          waste_kg?: number
          water_liters?: number
        }
        Update: {
          calculated_at?: string
          co2e_kg?: number
          energy_kwh?: number
          id?: string
          material_kg?: number
          methodology_version?: string
          reuse_count?: number
          trade_id?: string
          waste_kg?: number
          water_liters?: number
        }
        Relationships: [
          {
            foreignKeyName: "impact_records_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: true
            referencedRelation: "trades"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_images: {
        Row: {
          created_at: string
          id: string
          listing_id: string
          sort_order: number
          storage_path: string
        }
        Insert: {
          created_at?: string
          id?: string
          listing_id: string
          sort_order?: number
          storage_path: string
        }
        Update: {
          created_at?: string
          id?: string
          listing_id?: string
          sort_order?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_images_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          brand: string | null
          category_id: string | null
          city: string | null
          condition: string | null
          created_at: string
          delivery_options: string[]
          description: string | null
          district: string | null
          favorite_count: number
          id: string
          latitude: number | null
          longitude: number | null
          looking_for: string
          looking_for_categories: string[]
          model: string | null
          owner_id: string
          slug: string
          status: string
          tags: string[]
          title: string
          updated_at: string
          view_count: number
        }
        Insert: {
          brand?: string | null
          category_id?: string | null
          city?: string | null
          condition?: string | null
          created_at?: string
          delivery_options?: string[]
          description?: string | null
          district?: string | null
          favorite_count?: number
          id?: string
          latitude?: number | null
          longitude?: number | null
          looking_for?: string
          looking_for_categories?: string[]
          model?: string | null
          owner_id: string
          slug?: string
          status?: string
          tags?: string[]
          title: string
          updated_at?: string
          view_count?: number
        }
        Update: {
          brand?: string | null
          category_id?: string | null
          city?: string | null
          condition?: string | null
          created_at?: string
          delivery_options?: string[]
          description?: string | null
          district?: string | null
          favorite_count?: number
          id?: string
          latitude?: number | null
          longitude?: number | null
          looking_for?: string
          looking_for_categories?: string[]
          model?: string | null
          owner_id?: string
          slug?: string
          status?: string
          tags?: string[]
          title?: string
          updated_at?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "listings_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      loop_participants: {
        Row: {
          id: string
          joined_at: string
          loop_id: string
          offering_listing_id: string | null
          role: string
          status: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          loop_id: string
          offering_listing_id?: string | null
          role?: string
          status?: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          loop_id?: string
          offering_listing_id?: string | null
          role?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loop_participants_loop_id_fkey"
            columns: ["loop_id"]
            isOneToOne: false
            referencedRelation: "loops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loop_participants_offering_listing_id_fkey"
            columns: ["offering_listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      loops: {
        Row: {
          category: string
          created_at: string
          creator_id: string
          description: string | null
          id: string
          max_participants: number | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          creator_id: string
          description?: string | null
          id?: string
          max_participants?: number | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          creator_id?: string
          description?: string | null
          id?: string
          max_participants?: number | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          is_read: boolean
          sender_id: string
          trade_offer_id: string | null
          type: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          is_read?: boolean
          sender_id: string
          trade_offer_id?: string | null
          type?: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          is_read?: boolean
          sender_id?: string
          trade_offer_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_trade_offer_id_fkey"
            columns: ["trade_offer_id"]
            isOneToOne: false
            referencedRelation: "trade_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      needs: {
        Row: {
          category_id: string | null
          created_at: string
          fulfilled_at: string | null
          id: string
          note: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          fulfilled_at?: string | null
          id?: string
          note?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          fulfilled_at?: string | null
          id?: string
          note?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "needs_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "needs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          conversation_id: string | null
          created_at: string
          id: string
          is_read: boolean
          link_url: string | null
          listing_id: string | null
          message: string
          need_id: string | null
          offer_id: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          link_url?: string | null
          listing_id?: string | null
          message: string
          need_id?: string | null
          offer_id?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          link_url?: string | null
          listing_id?: string | null
          message?: string
          need_id?: string | null
          offer_id?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      post_likes: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          city: string | null
          created_at: string
          district: string | null
          email: string | null
          first_name: string | null
          full_name: string | null
          id: string
          interests: string[]
          is_admin: boolean
          last_name: string | null
          phone: string
          sms_verification_enabled: boolean
          updated_at: string
          username: string | null
          wanted_categories: string[]
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          created_at?: string
          district?: string | null
          email?: string | null
          first_name?: string | null
          full_name?: string | null
          id: string
          interests?: string[]
          is_admin?: boolean
          last_name?: string | null
          phone: string
          sms_verification_enabled?: boolean
          updated_at?: string
          username?: string | null
          wanted_categories?: string[]
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          created_at?: string
          district?: string | null
          email?: string | null
          first_name?: string | null
          full_name?: string | null
          id?: string
          interests?: string[]
          is_admin?: boolean
          last_name?: string | null
          phone?: string
          sms_verification_enabled?: boolean
          updated_at?: string
          username?: string | null
          wanted_categories?: string[]
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string
          description: string | null
          evidence_images: string[]
          id: string
          priority: string
          reason: string
          reporter_id: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          target_id: string
          target_title: string | null
          target_type: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          evidence_images?: string[]
          id?: string
          priority?: string
          reason: string
          reporter_id: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          target_id: string
          target_title?: string | null
          target_type: string
        }
        Update: {
          created_at?: string
          description?: string | null
          evidence_images?: string[]
          id?: string
          priority?: string
          reason?: string
          reporter_id?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          target_id?: string
          target_title?: string | null
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      disputes: {
        Row: {
          admin_decision: string | null
          created_at: string
          evidence_photos: string[]
          id: string
          initiator_id: string
          reason: string
          resolved_at: string | null
          resolved_by: string | null
          respondent_id: string
          status: string
          trade_id: string
        }
        Insert: {
          admin_decision?: string | null
          created_at?: string
          evidence_photos?: string[]
          id?: string
          initiator_id: string
          reason: string
          resolved_at?: string | null
          resolved_by?: string | null
          respondent_id: string
          status?: string
          trade_id: string
        }
        Update: {
          admin_decision?: string | null
          created_at?: string
          evidence_photos?: string[]
          id?: string
          initiator_id?: string
          reason?: string
          resolved_at?: string | null
          resolved_by?: string | null
          respondent_id?: string
          status?: string
          trade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "disputes_initiator_id_fkey"
            columns: ["initiator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_respondent_id_fkey"
            columns: ["respondent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "trades"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_audit_logs: {
        Row: {
          action: string
          admin_id: string
          admin_name: string
          created_at: string
          details: string | null
          id: string
          target: string
        }
        Insert: {
          action: string
          admin_id: string
          admin_name: string
          created_at?: string
          details?: string | null
          id?: string
          target: string
        }
        Update: {
          action?: string
          admin_id?: string
          admin_name?: string
          created_at?: string
          details?: string | null
          id?: string
          target?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_logs_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          comment: string | null
          communication_rating: number | null
          created_at: string
          delivery_rating: number | null
          id: string
          item_accuracy_rating: number | null
          rating: number
          reviewed_user_id: string
          reviewer_id: string
          trade_id: string
        }
        Insert: {
          comment?: string | null
          communication_rating?: number | null
          created_at?: string
          delivery_rating?: number | null
          id?: string
          item_accuracy_rating?: number | null
          rating: number
          reviewed_user_id: string
          reviewer_id: string
          trade_id: string
        }
        Update: {
          comment?: string | null
          communication_rating?: number | null
          created_at?: string
          delivery_rating?: number | null
          id?: string
          item_accuracy_rating?: number | null
          rating?: number
          reviewed_user_id?: string
          reviewer_id?: string
          trade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_reviewed_user_id_fkey"
            columns: ["reviewed_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "trades"
            referencedColumns: ["id"]
          },
        ]
      }
      trade_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          id: string
          note: string | null
          trade_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          note?: string | null
          trade_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          note?: string | null
          trade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trade_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_events_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "trades"
            referencedColumns: ["id"]
          },
        ]
      }
      trade_offer_items: {
        Row: {
          created_at: string
          id: string
          listing_id: string
          offer_id: string
          owner_id: string
          role: string
        }
        Insert: {
          created_at?: string
          id?: string
          listing_id: string
          offer_id: string
          owner_id: string
          role: string
        }
        Update: {
          created_at?: string
          id?: string
          listing_id?: string
          offer_id?: string
          owner_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "trade_offer_items_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_offer_items_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "trade_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_offer_items_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trade_offers: {
        Row: {
          cancellation_note: string | null
          cancellation_reason: string | null
          created_at: string
          delivery_location_name: string | null
          delivery_method: string | null
          delivery_notes: string | null
          delivery_scheduled_at: string | null
          expires_at: string
          id: string
          message: string | null
          parent_offer_id: string | null
          receiver_id: string
          sender_id: string
          status: string
          updated_at: string
        }
        Insert: {
          cancellation_note?: string | null
          cancellation_reason?: string | null
          created_at?: string
          delivery_location_name?: string | null
          delivery_method?: string | null
          delivery_notes?: string | null
          delivery_scheduled_at?: string | null
          expires_at?: string
          id?: string
          message?: string | null
          parent_offer_id?: string | null
          receiver_id: string
          sender_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          cancellation_note?: string | null
          cancellation_reason?: string | null
          created_at?: string
          delivery_location_name?: string | null
          delivery_method?: string | null
          delivery_notes?: string | null
          delivery_scheduled_at?: string | null
          expires_at?: string
          id?: string
          message?: string | null
          parent_offer_id?: string | null
          receiver_id?: string
          sender_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trade_offers_parent_offer_id_fkey"
            columns: ["parent_offer_id"]
            isOneToOne: false
            referencedRelation: "trade_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_offers_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_offers_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trades: {
        Row: {
          cancellation_note: string | null
          cancellation_reason: string | null
          completed_at: string | null
          delivery_location_name: string | null
          delivery_method: string | null
          delivery_notes: string | null
          delivery_scheduled_at: string | null
          id: string
          offer_id: string
          receiver_id: string
          sender_id: string
          started_at: string
          status: string
        }
        Insert: {
          cancellation_note?: string | null
          cancellation_reason?: string | null
          completed_at?: string | null
          delivery_location_name?: string | null
          delivery_method?: string | null
          delivery_notes?: string | null
          delivery_scheduled_at?: string | null
          id?: string
          offer_id: string
          receiver_id: string
          sender_id: string
          started_at?: string
          status?: string
        }
        Update: {
          cancellation_note?: string | null
          cancellation_reason?: string | null
          completed_at?: string | null
          delivery_location_name?: string | null
          delivery_method?: string | null
          delivery_notes?: string | null
          delivery_scheduled_at?: string | null
          id?: string
          offer_id?: string
          receiver_id?: string
          sender_id?: string
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "trades_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "trade_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trust_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          note: string | null
          review_id: string | null
          score_change: number | null
          trade_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          note?: string | null
          review_id?: string | null
          score_change?: number | null
          trade_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          note?: string | null
          review_id?: string | null
          score_change?: number | null
          trade_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trust_events_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trust_events_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "trades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trust_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trust_profiles: {
        Row: {
          average_rating: number
          cancelled_trades: number
          completed_loops: number
          completed_trades: number
          response_rate: number
          review_count: number
          trust_score: number
          updated_at: string
          user_id: string
          verification_level: string
        }
        Insert: {
          average_rating?: number
          cancelled_trades?: number
          completed_loops?: number
          completed_trades?: number
          response_rate?: number
          review_count?: number
          trust_score?: number
          updated_at?: string
          user_id: string
          verification_level?: string
        }
        Update: {
          average_rating?: number
          cancelled_trades?: number
          completed_loops?: number
          completed_trades?: number
          response_rate?: number
          review_count?: number
          trust_score?: number
          updated_at?: string
          user_id?: string
          verification_level?: string
        }
        Relationships: [
          {
            foreignKeyName: "trust_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
