'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isValidE164Phone } from '@/lib/utils'

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const signUpSchema = z
  .object({
    name: z.string().min(2, 'Name must be at least 2 characters').max(100),
    email: z.string().email('Invalid email address'),
    phone: z.string().refine(isValidE164Phone, {
      message: 'Phone must be in E.164 format, e.g. +44 7700 900000',
    }),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

const signInSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

const resetPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
})

const updatePasswordSchema = z
  .object({
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

const updateProfileSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  phone: z.string().refine(isValidE164Phone, {
    message: 'Phone must be in E.164 format, e.g. +44 7700 900000',
  }),
})

// ─── Action result type ───────────────────────────────────────────────────────

export type ActionResult = { error: string } | { success: true }

// ─── Helper: get db client as any to avoid Supabase column-select typing issues ───

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = { from: (table: string) => any }

// ─── signUp ───────────────────────────────────────────────────────────────────

export async function signUp(formData: FormData): Promise<ActionResult> {
  const raw = {
    name: formData.get('name') as string,
    email: formData.get('email') as string,
    phone: (formData.get('phone') as string)?.replace(/\s/g, ''),
    password: formData.get('password') as string,
    confirmPassword: formData.get('confirmPassword') as string,
  }

  const parsed = signUpSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const { name, email, phone, password } = parsed.data

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const supabase = await createClient()

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${appUrl}/auth/callback?next=/auth/verify-success`,
      data: { name },
    },
  })

  if (authError) {
    return { error: authError.message }
  }

  if (!authData.user) {
    return { error: 'Failed to create account. Please try again.' }
  }

  // Insert profile row — cast to AnySupabaseClient to bypass column-select type inference issues
  const db = supabase as unknown as AnySupabaseClient
  const { error: profileError } = await db.from('profiles').insert({
    id: authData.user.id,
    name,
    email,
    phone,
  })

  if (profileError) {
    // If duplicate (23505), that's OK — user may have partially signed up before
    if (!profileError.code?.includes('23505')) {
      return { error: profileError.message }
    }
  }

  redirect('/auth/check-email')
}

// ─── signIn ───────────────────────────────────────────────────────────────────

export async function signIn(formData: FormData): Promise<ActionResult> {
  const raw = {
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  }

  const parsed = signInSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const { email, password } = parsed.data
  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}

// ─── signOut ──────────────────────────────────────────────────────────────────

export async function signOut(): Promise<never> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/')
}

// ─── resetPassword ────────────────────────────────────────────────────────────

export async function resetPassword(formData: FormData): Promise<ActionResult> {
  const raw = {
    email: formData.get('email') as string,
  }

  const parsed = resetPasswordSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const supabase = await createClient()

  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${appUrl}/auth/callback?next=/auth/reset-password/confirm`,
  })

  if (error) {
    return { error: error.message }
  }

  return { success: true }
}

// ─── updatePassword ───────────────────────────────────────────────────────────

export async function updatePassword(formData: FormData): Promise<ActionResult> {
  const raw = {
    password: formData.get('password') as string,
    confirmPassword: formData.get('confirmPassword') as string,
  }

  const parsed = updatePasswordSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  })

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/settings', 'layout')
  redirect('/dashboard')
}

// ─── updateProfile ────────────────────────────────────────────────────────────

export async function updateProfile(formData: FormData): Promise<ActionResult> {
  const raw = {
    name: formData.get('name') as string,
    phone: (formData.get('phone') as string)?.replace(/\s/g, ''),
  }

  const parsed = updateProfileSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  const db = supabase as unknown as AnySupabaseClient
  const { error } = await db
    .from('profiles')
    .update({ name: parsed.data.name, phone: parsed.data.phone })
    .eq('id', user.id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/settings/profile')
  return { success: true }
}

// ─── deleteAccount ────────────────────────────────────────────────────────────

export async function deleteAccount(): Promise<ActionResult> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  const serviceClient = await createServiceClient()
  const db = serviceClient as unknown as AnySupabaseClient

  // Soft delete: anonymise profile and set deleted_at
  const { error: profileError } = await db
    .from('profiles')
    .update({
      deleted_at: new Date().toISOString(),
      name: 'Deleted User',
      email: `deleted_${user.id}@deleted.invalid`,
      phone: '+00000000000',
    })
    .eq('id', user.id)

  if (profileError) {
    return { error: profileError.message }
  }

  // Sign out first, then redirect
  await supabase.auth.signOut()

  redirect('/')
}
