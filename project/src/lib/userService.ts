import { supabase } from './supabase';
import { DebugLogger } from './debug';

export interface UserProfile {
  id: string;
  email: string;
  package_type: 'individual' | 'enterprise';
  created_at: string;
  updated_at: string;
}

export class UserService {
  static async ensureUserProfile(userId: string, email: string, packageType: 'individual' | 'enterprise' = 'individual'): Promise<{ success: boolean; user?: UserProfile; error?: string }> {
    try {
      DebugLogger.log(`Ensuring user profile exists for: ${DebugLogger.maskSensitive(userId)}`);
      
      // First, check if user already exists
      const { data: existingUser, error: selectError } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (!selectError && existingUser) {
        DebugLogger.log('User profile already exists');
        return { success: true, user: existingUser };
      }

      // User doesn't exist, create it
      DebugLogger.log('Creating new user profile');
      const { data: newUser, error: insertError } = await supabase
        .from('users')
        .insert({
          id: userId,
          email: email,
          package_type: packageType
        })
        .select()
        .single();

      if (insertError) {
        DebugLogger.error('Failed to create user profile', insertError);
        
        // Check if it's a duplicate key error (user might have been created by trigger)
        if (insertError.code === '23505') {
          // Try to fetch the user again
          const { data: fetchedUser, error: fetchError } = await supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();
            
          if (!fetchError && fetchedUser) {
            DebugLogger.log('User profile found after duplicate error');
            return { success: true, user: fetchedUser };
          }
        }
        
        return { 
          success: false, 
          error: `Failed to create user profile: ${insertError.message}` 
        };
      }

      DebugLogger.log('User profile created successfully');
      return { success: true, user: newUser };

    } catch (error) {
      DebugLogger.error('Error in ensureUserProfile', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  static async updateUserProfile(userId: string, updates: Partial<Pick<UserProfile, 'package_type'>>): Promise<{ success: boolean; user?: UserProfile; error?: string }> {
    try {
      DebugLogger.log(`Updating user profile: ${DebugLogger.maskSensitive(userId)}`);
      
      const { data: updatedUser, error } = await supabase
        .from('users')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId)
        .select()
        .single();

      if (error) {
        DebugLogger.error('Failed to update user profile', error);
        return { 
          success: false, 
          error: `Failed to update profile: ${error.message}` 
        };
      }

      DebugLogger.log('User profile updated successfully');
      return { success: true, user: updatedUser };

    } catch (error) {
      DebugLogger.error('Error in updateUserProfile', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  static async getUserProfile(userId: string): Promise<{ success: boolean; user?: UserProfile; error?: string }> {
    try {
      const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // User not found
          return { success: false, error: 'User profile not found' };
        }
        
        DebugLogger.error('Failed to get user profile', error);
        return { 
          success: false, 
          error: `Failed to get profile: ${error.message}` 
        };
      }

      return { success: true, user };

    } catch (error) {
      DebugLogger.error('Error in getUserProfile', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }
}