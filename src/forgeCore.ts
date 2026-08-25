export const FORGE_CORE_CONFIG = {
  url: 'https://uyqanhwurngoupmvzxrh.supabase.co',
  publishableKey: 'sb_publishable_SquKrj848EoO9NHZknVkSA_k8CKD7WQ',
  supabaseJsUrl: 'https://esm.sh/@supabase/supabase-js@2.112.4',
  defaultLocationCode: 'JK-MAIN'
} as const;

type SupabaseClientLike = any;
let clientPromise: Promise<SupabaseClientLike> | null = null;

export interface QuoterContext {
  userId: string;
  email: string;
  organizationId: string;
  organizationName: string;
  role: string;
  locationId?: string;
  locationName?: string;
}

export interface CoreScope {
  id: string;
  title: string;
  scopeType?: string;
  status: string;
  currentVersion: number;
  structuredData: Record<string, any>;
  projectId?: string;
  projectName?: string;
  customerId?: string;
  customerName?: string;
  source?: string;
  updatedAt: string;
}

export interface CoreTakeoff {
  id: string;
  title: string;
  status: string;
  scopeId?: string;
  projectId?: string;
  itemCount: number;
  source?: string;
  createdAt: string;
}

export interface QuoterWorkspace {
  context: QuoterContext | null;
  scopes: CoreScope[];
  takeoffs: CoreTakeoff[];
}

export interface EstimateItem {
  category: string;
  sku?: string;
  description: string;
  quantity: number;
  unit?: string;
  source?: string;
  confidence?: string;
  notes?: string;
  needsVerification?: boolean;
}

export interface EstimateResult {
  projectSummary?: string;
  assumptions: string[];
  rfis: string[];
  warnings: string[];
  items: EstimateItem[];
}

export async function getForgeCoreClient(): Promise<SupabaseClientLike> {
  if (!clientPromise) {
    clientPromise = import(/* @vite-ignore */ FORGE_CORE_CONFIG.supabaseJsUrl).then((module: any) =>
      module.createClient(FORGE_CORE_CONFIG.url, FORGE_CORE_CONFIG.publishableKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      })
    );
  }
  return clientPromise;
}

export async function loadQuoterWorkspace(): Promise<QuoterWorkspace> {
  const client = await getForgeCoreClient();
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError) throw userError;
  const user = userData?.user;
  if (!user) return { context: null, scopes: [], takeoffs: [] };

  const { data: memberships, error: membershipError } = await client
    .from('organization_memberships')
    .select('organization_id,role,status')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .limit(1);
  if (membershipError) throw membershipError;

  const membership = memberships?.[0];
  if (!membership) {
    return {
      context: {
        userId: user.id,
        email: user.email || '',
        organizationId: '',
        organizationName: '',
        role: 'unassigned'
      },
      scopes: [],
      takeoffs: []
    };
  }

  const organizationId = membership.organization_id;
  const [organizationResult, locationsResult, customersResult, projectsResult, scopesResult, takeoffsResult] = await Promise.all([
    client.from('organizations').select('id,name').eq('id', organizationId).single(),
    client.from('locations').select('id,name,code,status').eq('organization_id', organizationId).eq('status', 'active').order('name'),
    client.from('customers').select('id,display_name').eq('organization_id', organizationId),
    client.from('projects').select('id,name,customer_id').eq('organization_id', organizationId),
    client.from('scopes')
      .select('id,title,scope_type,status,current_version,structured_data,project_id,customer_id,source,updated_at')
      .eq('organization_id', organizationId)
      .order('updated_at', { ascending: false })
      .limit(200),
    client.from('takeoffs')
      .select('id,title,status,scope_id,project_id,totals,source,created_at')
      .eq('organization_id', organizationId)
      .eq('source', 'forge-quoter')
      .order('created_at', { ascending: false })
      .limit(50)
  ]);

  for (const result of [organizationResult, locationsResult, customersResult, projectsResult, scopesResult, takeoffsResult]) {
    if (result.error) throw result.error;
  }

  const locations = locationsResult.data || [];
  const location = locations.find((row: any) => row.code === FORGE_CORE_CONFIG.defaultLocationCode) || locations[0];
  const customerMap = new Map<string, string>((customersResult.data || []).map((row: any) => [String(row.id), String(row.display_name || '')]));
  const projectMap = new Map<string, { name?: string; customer_id?: string }>((projectsResult.data || []).map((row: any) => [String(row.id), { name: row.name || undefined, customer_id: row.customer_id || undefined }]));

  const scopes: CoreScope[] = (scopesResult.data || []).map((row: any) => {
    const project = row.project_id ? projectMap.get(row.project_id) : null;
    const customerId = row.customer_id || project?.customer_id || undefined;
    return {
      id: row.id,
      title: row.title || row.structured_data?.fields?.projectName?.value || 'Untitled Scope',
      scopeType: row.scope_type || row.structured_data?.type || undefined,
      status: row.status,
      currentVersion: row.current_version,
      structuredData: row.structured_data || {},
      projectId: row.project_id || undefined,
      projectName: project?.name || undefined,
      customerId,
      customerName: customerId ? customerMap.get(customerId) || undefined : undefined,
      source: row.source || undefined,
      updatedAt: row.updated_at
    };
  });

  const takeoffs: CoreTakeoff[] = (takeoffsResult.data || []).map((row: any) => ({
    id: row.id,
    title: row.title || 'Untitled Takeoff',
    status: row.status,
    scopeId: row.scope_id || undefined,
    projectId: row.project_id || undefined,
    itemCount: Number(row.totals?.item_count || 0),
    source: row.source || undefined,
    createdAt: row.created_at
  }));

  return {
    context: {
      userId: user.id,
      email: user.email || '',
      organizationId,
      organizationName: organizationResult.data?.name || 'Forge Organization',
      role: membership.role,
      locationId: location?.id || undefined,
      locationName: location?.name || 'Organization-wide'
    },
    scopes,
    takeoffs
  };
}

export async function sendQuoterMagicLink(email: string): Promise<void> {
  const client = await getForgeCoreClient();
  const { error } = await client.auth.signInWithOtp({
    email: email.trim(),
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${window.location.origin}${window.location.pathname}`
    }
  });
  if (error) throw error;
}

export async function signOutQuoter(): Promise<void> {
  const client = await getForgeCoreClient();
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

export async function commitEstimateToCore(
  context: QuoterContext,
  scope: CoreScope,
  estimate: EstimateResult,
  model: string
): Promise<{ takeoffId: string; itemCount: number }> {
  const client = await getForgeCoreClient();
  const categories = Array.from(new Set(estimate.items.map(item => item.category).filter(Boolean)));
  const now = new Date().toISOString();

  const items = estimate.items.map(item => ({
    category: item.category || 'Other',
    sku: item.sku || null,
    description: item.description,
    quantity: Number.isFinite(Number(item.quantity)) ? Number(item.quantity) : 0,
    unit: item.unit || null,
    metadata: {
      source: item.source || null,
      confidence: item.confidence || null,
      notes: item.notes || null,
      needs_verification: Boolean(item.needsVerification),
      ai_model: model,
      scope_version: scope.currentVersion
    }
  }));

  const { data, error } = await client.rpc('commit_ai_takeoff_v1', {
    p_organization_id: context.organizationId,
    p_location_id: context.locationId || null,
    p_project_id: scope.projectId || null,
    p_scope_id: scope.id,
    p_title: `${scope.title} — AI Takeoff`,
    p_assumptions: {
      assumptions: estimate.assumptions,
      rfis: estimate.rfis,
      warnings: estimate.warnings,
      project_summary: estimate.projectSummary || null
    },
    p_totals: {
      categories,
      generated_at: now,
      ai_model: model,
      scope_version: scope.currentVersion
    },
    p_items: items
  });
  if (error) throw error;

  const result = data?.[0];
  if (!result?.takeoff_id) throw new Error('Forge Core did not return a takeoff ID.');
  return { takeoffId: result.takeoff_id, itemCount: Number(result.item_count || items.length) };
}
