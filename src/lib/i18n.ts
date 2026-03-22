import { format as dateFnsFormat, isToday, isTomorrow, isYesterday, isThisWeek } from "date-fns";
import { es } from "date-fns/locale";

export type Locale = "en-US" | "es-ES";

export const LOCALES: { value: Locale; label: string }[] = [
  { value: "en-US", label: "English (US)" },
  { value: "es-ES", label: "Español (España)" },
];

export type TranslationKey = keyof typeof TRANSLATIONS_EN;

const TRANSLATIONS_EN = {
  // Common
  "common.loading": "Loading...",
  "common.save": "Save",
  "common.cancel": "Cancel",
  "common.delete": "Delete",
  "common.copy": "Copy",
  "common.copied": "Copied",
  "common.back": "Back",
  "common.settings": "Settings",
  "common.signOut": "Sign out",

  // App
  "app.title": "FlipTurns",
  "app.description": "Coach and swimmer workout calendar",

  // Login
  "login.signIn": "Sign in",
  "login.createAccount": "Create account",
  "login.fullName": "Full name",
  "login.fullNamePlaceholder": "Jane Smith",
  "login.email": "Email",
  "login.emailPlaceholder": "you@example.com",
  "login.password": "Password",
  "login.passwordPlaceholder": "••••••••",
  "login.confirmPassword": "Confirm password",
  "login.confirmPasswordPlaceholder": "••••••••",
  "login.iAmA": "I am a",
  "login.swimmer": "Swimmer",
  "login.coach": "Coach",
  "login.pleaseWait": "Please wait...",
  "login.noAccount": "Don't have an account?",
  "login.signUp": "Sign up",
  "login.haveAccount": "Already have an account?",

  // Main page
  "main.allWorkouts": "All workouts",
  "main.groupWorkouts": "Group workouts",
  "main.myWorkouts": "My workouts",
  "main.noWorkout": "No workout",
  "main.noWorkoutForDay": "No workout planned for this day.",
  "main.day": "Day",
  "main.week": "Week",
  "main.month": "Month",
  "main.editDay": "Edit day",
  "main.addWorkout": "Add workout",
  "main.assignTo": "Assign to...",
  "main.anytime": "Anytime",
  "main.category": "Category",
  "main.pool": "Pool",
  "main.swimmersInWorkout": "Swimmers in this workout",
  "main.resetToDefault": "Reset to default group",
  "main.workoutConflict": "This swimmer has another workout in the same timeframe",
  "main.workoutPlaceholder": "Warm-up: 200 free, 4×50 kick...\nMain set: 8×100 @ 1:30...\nCool-down: 200 easy",
  "main.saved": "Saved ✓",
  "main.deleteWorkoutConfirm": "Delete this workout?",
  "main.assignedTo": "Assigned to",
  "main.teammates": "Teammates",
  "main.session": "Session",
  "main.exportPdf": "Download PDF",
  "main.exportPdfTitle": "Download this workout as a PDF file",
  "main.workoutN": "Workout {n}",
  "main.settingUpAccount": "Setting up your account...",
  "main.setupPersist": "If this persists, the database migration may not have been applied yet. Try signing out and back in.",
  "main.weekWorkouts": "workout",
  "main.weekWorkoutsPlural": "workouts",
  "main.previous": "Previous",
  "main.next": "Next",
  "main.expandWorkout": "Expand workout",
  "main.collapseWorkout": "Collapse workout",

  // Settings
  "settings.profile": "Profile",
  "settings.editProfile": "Edit profile",
  "settings.name": "Name",
  "settings.namePlaceholder": "Your name",
  "settings.email": "Email",
  "settings.emailPlaceholder": "your@email.com",
  "settings.memberSince": "Member since",
  "settings.group": "Group",
  "settings.preferences": "Preferences",
  "settings.poolSize": "Default pool size",
  "settings.firstDayOfWeek": "First day of week",
  "settings.monday": "Monday",
  "settings.sunday": "Sunday",
  "settings.language": "Language",
  "settings.poolSizeDescription": "Used as the default for the pool size dropdown when creating or editing workouts. Does not override workouts that already have a pool size set.",
  "settings.teamManagement": "Team management",
  "settings.teamName": "Team name",
  "settings.teamNamePlaceholder": "e.g. Sprint Team",
  "settings.editTeamName": "Edit team name",
  "settings.teamManagementDesc": "Assign swimmers to groups. This overrides the group they chose in their own profile.",
  "settings.loadingSwimmers": "Loading swimmers…",
  "settings.noSwimmersYet": "No swimmers yet.",
  "settings.changePassword": "Change password",
  "settings.newPassword": "New password",
  "settings.confirmPassword": "Confirm password",
  "settings.deleteAccount": "Delete account",
  "settings.deleteAccountConfirm": "Type DELETE to confirm",
  "settings.removeSwimmer": "Remove a swimmer",
  "settings.volumeAnalytics": "Volume analytics",
  "settings.selectSwimmerGroup": "Select swimmer/group",
  "settings.noVolumeData": "No volume data in this range",
  "settings.weekly": "Weekly",
  "settings.monthly": "Monthly",
  "settings.groups": "Groups",
  "settings.swimmers": "Swimmers",
  "settings.previousPeriod": "Previous period",
  "settings.nextPeriod": "Next period",
  "settings.week": "Week",
  "settings.semanaDel": "Semana del",
  "notif.noNewWorkouts": "No new workouts",
  "notif.noNewFeedback": "No new feedback",
  "notif.dismiss": "Dismiss notification",
  "notif.notifications": "Notifications",
  "notif.coachWroteWorkoutNoName": "Coach wrote a new workout for:",
  "notif.someoneAddedFeedback": "Someone added new feedback to:",
  "settings.meters": "Meters",
  "settings.saving": "Saving…",
  "settings.passwordMinLength": "Password must be at least 6 characters",
  "settings.passwordsNoMatch": "Passwords do not match",
  "settings.failedUpdatePassword": "Failed to update password",
  "settings.mustSignInToDelete": "You must be signed in to delete your account",
  "settings.failedDeleteAccount": "Failed to delete account",
  "settings.runCoachMigration": "Could not save. Run the coach migration (see setup page).",
  "settings.notSignedIn": "Not signed in",

  // Workout analysis / feedback
  "feedback.distance": "Distance",
  "feedback.duration": "Duration",
  "feedback.addFeedback": "Add feedback",
  "feedback.yourFeedback": "Your feedback",
  "feedback.feedback": "Feedback",
  "feedback.muscleIntensity": "Muscle intensity",
  "feedback.cardioIntensity": "Cardio intensity",
  "feedback.optional": "Optional",
  "feedback.submit": "Submit",
  "feedback.edit": "Edit",
  "feedback.anonymous": "Anonymous",
  "feedback.unknown": "Unknown",
  "feedback.min": "min",
  "feedback.h": "h",
  "feedback.volume": "Volume",
  "feedback.total": "Total",
  "feedback.yourFeedbackOptional": "Your feedback (optional)",
  "feedback.muscleIntensityOptional": "Muscle intensity (1–5, optional)",
  "feedback.cardioIntensityOptional": "Cardio intensity (1–5, optional)",
  "feedback.showAnonymous": "Show as anonymous to coach",
  "feedback.deleteConfirm": "Delete this feedback?",
  "feedback.anonymousToCoach": "Anonymous to coach",
  "feedback.loadingFeedback": "Loading feedback…",
  "feedback.noFeedbackYet": "No feedback yet.",
  "feedback.submitAnonymous": "Submit anonymously (coach won't see your name)",
  "feedback.fixInSetup": "Fix in Database setup →",

  // Volume analytics
  "volume.weekLabel": "Week {n}",
  "volume.semanaLabel": "Semana {n}",
  "volume.dayMon": "Mon",
  "volume.dayTue": "Tue",
  "volume.dayWed": "Wed",
  "volume.dayThu": "Thu",
  "volume.dayFri": "Fri",
  "volume.daySat": "Sat",
  "volume.daySun": "Sun",

  // Coach workout editor
  "coach.swimmer": "Swimmer",
  "coach.group": "Group",
  "coach.category": "Category",
  "coach.pool": "Pool",
  "coach.swimmersInWorkout": "Swimmers in this workout",
  "coach.resetToDefault": "Reset to default group",
  "coach.workoutConflict": "This swimmer has another workout in the same timeframe",
  "coach.deleting": "Deleting…",
  "coach.deleteAccount": "Delete account",

  // Sign-out
  "signOut.confirm": "Sign out?",
  "signOut.yes": "Yes, sign out",

  // Delete account dialog
  "deleteAccount.title": "Delete your account?",
  "deleteAccount.description": "This action cannot be undone. All your data will be permanently deleted. Type delete below to confirm.",
  "deleteAccount.typeToConfirm": "Type \"delete\" to confirm",
  "deleteAccount.placeholder": "delete",

  // Remove swimmer dialog
  "removeSwimmer.title": "Are you sure you want to delete {name}'s account?",
  "removeSwimmer.description": "This action cannot be undone. All data for this swimmer will be permanently deleted.",
  "removeSwimmer.thisSwimmer": "this swimmer",

  // Session labels
  "session.am": "AM",
  "session.pm": "PM",

  // Swimmer groups (display labels)
  "group.sprint": "Sprinters",
  "group.middleDistance": "Middle Distance",
  "group.distance": "Distance",
  "group.notSet": "Not set",

  // Workout categories (display labels)
  "category.recovery": "Recovery",
  "category.aerobic": "Aerobic",
  "category.pace": "Pace",
  "category.speed": "Speed",
  "category.techSuit": "Tech suit",
  "category.empty": "",
  "category.workout": "Workout",

  // Pool size (display labels)
  "pool.lcm": "LCM",
  "pool.scm": "SCM",
  "pool.scy": "SCY",

  // Workout set names (volume breakdown)
  "set.warmUp": "Warm Up",
  "set.mainSet": "Main Set",
  "set.preSet": "Pre set",
  "set.coolDown": "Cool down",
  "set.pullSet": "Pull Set",
  "set.kickSet": "Kick Set",
  "set.speedSet": "Speed Set",

  // Other
  "common.saved": "Saved",
  "settings.coachesAssignGroup": "Coaches can assign workouts to your group; all swimmers in that group will see them.",

  // Notifications
  "notif.coachWroteWorkout": "Coach {name} wrote a new workout for:",
  "notif.swimmerWroteOwnWorkout": "{name} wrote their own workout for:",
  "notif.swimmerWroteYourWorkout": "{name} wrote your workout for:",
  "notif.swimmerWroteWorkout": "{name} wrote a workout for:",
  "notif.addedFeedbackTo": "added new feedback to:",
  "notif.personAddedFeedback": "{name} added new feedback to:",
  "notif.today": "Today",
  "notif.tomorrow": "Tomorrow",
  "notif.yesterday": "Yesterday",
  "notif.thisWeek": "This week",
  "notif.noNotifications": "No notifications",

  // Setup page
  "setup.databaseSetup": "Database setup",
  "setup.fixWorkoutSave": "Fix workout save",
  "setup.fixWorkoutSaveDesc": "If coaches can't save workouts, run this in Supabase SQL Editor.",
  "setup.copyAll": "Copy all",
  "setup.poolSizePerWorkout": "Pool size per workout",
  "setup.poolSizeDesc": "Lets coaches assign LCM, SCM, or SCY to each workout. When SCY, analysis shows yards.",
  "setup.fullSetup": "Full setup (recommended)",
  "setup.fullSetupDesc": "Complete SQL with comments. Run once in Supabase SQL Editor.",
  "setup.feedbackOnly": "Feedback only (edit & delete)",
  "setup.feedbackOnlyDesc": "If swimmers can add feedback but cannot edit or delete it, run this SQL in your Supabase project.",
  "setup.feedbackPerWorkout": "Feedback per workout",
  "setup.feedbackPerWorkoutDesc": "If feedback from one swimmer appears on other swimmers' workouts on the same day, run this to link feedback to each workout.",
  "setup.feedbackPerUser": "Feedback per user",
  "setup.feedbackPerUserDesc": "If swimmers can see or edit other swimmers' feedback, run this to link feedback to each user.",
  "setup.anonymousFeedback": "Anonymous feedback",
  "setup.anonymousFeedbackDesc": "Allows swimmers to submit feedback anonymously. Coaches see \"Anonymous\" instead of the swimmer's name. After adding the column, run the schema reload below so coaches see \"Anonymous\" correctly.",
  "setup.optionalIntensity": "Optional intensity ratings",
  "setup.optionalIntensityDesc": "Allows swimmers to add feedback without rating muscle/cardio intensity (1–5).",
  "setup.workoutsSaveType": "Workouts: save & type/category",
  "setup.workoutsSaveTypeDesc": "If coach cannot save workouts, or type/category don't work, run this SQL.",
  "setup.workoutGroups": "Workout groups (swimmer groups + group assignment)",
  "setup.workoutGroupsDesc": "Enables assigning workouts to groups (Sprint, Middle distance, Distance). Swimmers choose their group in Settings; coaches assign to a swimmer or a group.",
  "setup.coachTeamManagement": "Coach team management (assign swimmers to groups)",
  "setup.coachTeamManagementDesc": "If moving swimmers to groups in Settings doesn't save, run this in Supabase SQL Editor.",
  "setup.workoutCategoryPool": "Workout category & pool size not saving",
  "setup.workoutCategoryPoolDesc": "If workout type (Recovery, Aerobic, etc.) or pool size (LCM, SCM, SCY) don't persist after save, run this in Supabase SQL Editor. It creates RPC functions that bypass the schema cache.",
  "setup.schemaCacheError": "Coach save: \"Could not find column in schema cache\"",
  "setup.schemaCacheErrorDesc": "If coach save fails with a schema cache error, run NOTIFY pgrst, 'reload schema'; in Supabase SQL Editor to refresh the schema cache.",
  "setup.setupFooter": "Use \"Full setup\" for a fresh install, or the smaller blocks to fix specific issues.",
  "setup.openSupabase": "Open Supabase Dashboard",
  "setup.selectProject": "Select your project → SQL Editor",
  "setup.pasteAndRun": "Paste the SQL above and run it",
  "setup.thenRunSchema": "Then run this to refresh the schema cache (required for anonymous to work):",
} as const;

const TRANSLATIONS_ES: Record<TranslationKey, string> = {
  // Common
  "common.loading": "Cargando...",
  "common.save": "Guardar",
  "common.cancel": "Cancelar",
  "common.delete": "Eliminar",
  "common.copy": "Copiar",
  "common.copied": "Copiado",
  "common.back": "Atrás",
  "common.settings": "Ajustes",
  "common.signOut": "Cerrar sesión",

  // App
  "app.title": "FlipTurns",
  "app.description": "Calendario de entrenamientos para entrenadores y nadadores",

  // Login
  "login.signIn": "Iniciar sesión",
  "login.createAccount": "Crear cuenta",
  "login.fullName": "Nombre completo",
  "login.fullNamePlaceholder": "María García",
  "login.email": "Correo electrónico",
  "login.emailPlaceholder": "tu@ejemplo.com",
  "login.password": "Contraseña",
  "login.passwordPlaceholder": "••••••••",
  "login.confirmPassword": "Confirmar contraseña",
  "login.confirmPasswordPlaceholder": "••••••••",
  "login.iAmA": "Soy",
  "login.swimmer": "Nadador/a",
  "login.coach": "Entrenador/a",
  "login.pleaseWait": "Espera, por favor...",
  "login.noAccount": "¿No tienes cuenta?",
  "login.signUp": "Registrarse",
  "login.haveAccount": "¿Ya tienes cuenta?",

  // Main page
  "main.allWorkouts": "Todos los entrenamientos",
  "main.groupWorkouts": "Grupos",
  "main.myWorkouts": "Mis entrenamientos",
  "main.noWorkout": "Sin entrenamiento",
  "main.noWorkoutForDay": "No hay entrenamiento planificado para hoy.",
  "main.day": "Día",
  "main.week": "Semana",
  "main.month": "Mes",
  "main.editDay": "Editar día",
  "main.addWorkout": "Añadir entrenamiento",
  "main.assignTo": "Asignar a...",
  "main.anytime": "Libre",
  "main.category": "Categoría",
  "main.pool": "Piscina",
  "main.swimmersInWorkout": "Nadadores en este entrenamiento",
  "main.resetToDefault": "Restablecer al grupo por defecto",
  "main.workoutConflict": "Este nadador tiene otro entrenamiento en el mismo horario",
  "main.workoutPlaceholder": "Calentamiento: 200 libre, 4×50 patada...\nSerie principal: 8×100 @ 1:30...\nVuelta a la calma: 200 suave",
  "main.saved": "Guardado ✓",
  "main.deleteWorkoutConfirm": "¿Eliminar este entrenamiento?",
  "main.assignedTo": "Asignado a",
  "main.teammates": "Compañeros",
  "main.session": "Sesión",
  "main.exportPdf": "Descargar PDF",
  "main.exportPdfTitle": "Descargar este entrenamiento como archivo PDF",
  "main.workoutN": "Entrenamiento {n}",
  "main.settingUpAccount": "Configurando tu cuenta...",
  "main.setupPersist": "Si esto continúa, es posible que la migración de la base de datos no se haya aplicado. Prueba a cerrar sesión y volver a entrar.",
  "main.weekWorkouts": "entrenamiento",
  "main.weekWorkoutsPlural": "entrenamientos",
  "main.previous": "Anterior",
  "main.next": "Siguiente",
  "main.expandWorkout": "Desplegar entrenamiento",
  "main.collapseWorkout": "Contraer entrenamiento",

  // Settings
  "settings.profile": "Perfil",
  "settings.editProfile": "Editar perfil",
  "settings.name": "Nombre",
  "settings.namePlaceholder": "Tu nombre",
  "settings.email": "Correo electrónico",
  "settings.emailPlaceholder": "tu@correo.com",
  "settings.memberSince": "Miembro desde",
  "settings.group": "Grupo",
  "settings.preferences": "Preferencias",
  "settings.poolSize": "Tamaño de piscina por defecto",
  "settings.firstDayOfWeek": "Primer día de la semana",
  "settings.monday": "Lunes",
  "settings.sunday": "Domingo",
  "settings.language": "Idioma",
  "settings.poolSizeDescription": "Se usa como valor por defecto al crear o editar entrenamientos. No modifica los entrenamientos que ya tienen un tamaño de piscina.",
  "settings.teamManagement": "Gestión del equipo",
  "settings.teamName": "Nombre del equipo",
  "settings.teamNamePlaceholder": "ej. Equipo Sprint",
  "settings.editTeamName": "Editar nombre del equipo",
  "settings.teamManagementDesc": "Asigna nadadores a grupos. Esto sobrescribe el grupo que eligieron en su perfil.",
  "settings.loadingSwimmers": "Cargando nadadores…",
  "settings.noSwimmersYet": "Aún no hay nadadores.",
  "settings.changePassword": "Cambiar contraseña",
  "settings.newPassword": "Nueva contraseña",
  "settings.confirmPassword": "Confirmar contraseña",
  "settings.deleteAccount": "Eliminar cuenta",
  "settings.deleteAccountConfirm": "Escribe ELIMINAR para confirmar",
  "settings.removeSwimmer": "Eliminar nadador",
  "settings.volumeAnalytics": "Análisis de volumen",
  "settings.selectSwimmerGroup": "Elegir nadador/grupo",
  "settings.noVolumeData": "No hay datos de volumen en este período",
  "settings.weekly": "Semanal",
  "settings.monthly": "Mensual",
  "settings.groups": "Grupos",
  "settings.swimmers": "Nadadores",
  "settings.previousPeriod": "Período anterior",
  "settings.nextPeriod": "Período siguiente",
  "settings.week": "Semana",
  "settings.semanaDel": "Semana del",
  "notif.noNewWorkouts": "No hay entrenamientos nuevos",
  "notif.noNewFeedback": "No hay comentarios nuevos",
  "notif.dismiss": "Cerrar notificación",
  "notif.notifications": "Notificaciones",
  "notif.coachWroteWorkoutNoName": "El entrenador ha escrito un nuevo entrenamiento para:",
  "notif.someoneAddedFeedback": "Alguien ha añadido un nuevo comentario a:",
  "settings.meters": "Metros",
  "settings.saving": "Guardando…",
  "settings.passwordMinLength": "La contraseña debe tener al menos 6 caracteres",
  "settings.passwordsNoMatch": "Las contraseñas no coinciden",
  "settings.failedUpdatePassword": "Error al actualizar la contraseña",
  "settings.mustSignInToDelete": "Debes iniciar sesión para eliminar tu cuenta",
  "settings.failedDeleteAccount": "Error al eliminar la cuenta",
  "settings.runCoachMigration": "No se pudo guardar. Ejecuta la migración de entrenador (ver página de configuración).",
  "settings.notSignedIn": "No has iniciado sesión",

  // Workout analysis / feedback
  "feedback.distance": "Distancia",
  "feedback.duration": "Duración",
  "feedback.addFeedback": "Añadir feedback",
  "feedback.yourFeedback": "Tu comentario",
  "feedback.feedback": "Comentarios",
  "feedback.muscleIntensity": "Intensidad muscular",
  "feedback.cardioIntensity": "Intensidad cardio",
  "feedback.optional": "Opcional",
  "feedback.submit": "Enviar",
  "feedback.edit": "Editar",
  "feedback.anonymous": "Anónimo",
  "feedback.unknown": "Desconocido",
  "feedback.min": "min",
  "feedback.h": "h",
  "feedback.volume": "Volumen",
  "feedback.total": "Total",
  "feedback.yourFeedbackOptional": "Tu comentario (opcional)",
  "feedback.muscleIntensityOptional": "Intensidad muscular (1–5, opcional)",
  "feedback.cardioIntensityOptional": "Intensidad cardio (1–5, opcional)",
  "feedback.showAnonymous": "Mostrar como anónimo al entrenador",
  "feedback.deleteConfirm": "¿Eliminar este comentario?",
  "feedback.anonymousToCoach": "Anónimo para el entrenador",
  "feedback.loadingFeedback": "Cargando comentarios…",
  "feedback.noFeedbackYet": "Aún no hay comentarios.",
  "feedback.submitAnonymous": "Enviar de forma anónima (el entrenador no verá tu nombre)",
  "feedback.fixInSetup": "Arreglar en Configuración de base de datos →",

  // Volume analytics
  "volume.weekLabel": "Semana {n}",
  "volume.semanaLabel": "Semana {n}",
  "volume.dayMon": "Lun",
  "volume.dayTue": "Mar",
  "volume.dayWed": "Mié",
  "volume.dayThu": "Jue",
  "volume.dayFri": "Vie",
  "volume.daySat": "Sáb",
  "volume.daySun": "Dom",

  // Coach workout editor
  "coach.swimmer": "Nadador",
  "coach.group": "Grupo",
  "coach.category": "Categoría",
  "coach.pool": "Piscina",
  "coach.swimmersInWorkout": "Nadadores en este entrenamiento",
  "coach.resetToDefault": "Restablecer al grupo por defecto",
  "coach.workoutConflict": "Este nadador tiene otro entrenamiento en el mismo horario",
  "coach.deleting": "Eliminando…",
  "coach.deleteAccount": "Eliminar cuenta",

  // Sign-out
  "signOut.confirm": "¿Cerrar sesión?",
  "signOut.yes": "Sí, cerrar sesión",

  // Delete account dialog
  "deleteAccount.title": "¿Eliminar tu cuenta?",
  "deleteAccount.description": "Esta acción no se puede deshacer. Todos tus datos se eliminarán permanentemente. Escribe delete abajo para confirmar.",
  "deleteAccount.typeToConfirm": "Escribe \"delete\" para confirmar",
  "deleteAccount.placeholder": "delete",

  // Remove swimmer dialog
  "removeSwimmer.title": "¿Estás seguro de que quieres eliminar la cuenta de {name}?",
  "removeSwimmer.description": "Esta acción no se puede deshacer. Todos los datos de este nadador se eliminarán permanentemente.",
  "removeSwimmer.thisSwimmer": "este nadador",

  // Session labels
  "session.am": "AM",
  "session.pm": "PM",

  // Swimmer groups
  "group.sprint": "Velocistas",
  "group.middleDistance": "Medio Fondo",
  "group.distance": "Fondistas",
  "group.notSet": "Sin asignar",

  // Workout categories
  "category.recovery": "Recuperación",
  "category.aerobic": "Aeróbico",
  "category.pace": "Ritmo",
  "category.speed": "Velocidad",
  "category.techSuit": "Fastskin",
  "category.empty": "",
  "category.workout": "Entrenamiento",

  // Pool size (display labels)
  "pool.lcm": "50m",
  "pool.scm": "25m",
  "pool.scy": "25yd",

  // Workout set names (volume breakdown)
  "set.warmUp": "Calentamiento",
  "set.mainSet": "Set Principal",
  "set.preSet": "Pre set",
  "set.coolDown": "Suave",
  "set.pullSet": "Pull Set",
  "set.kickSet": "Set de pies",
  "set.speedSet": "Set de velocidad",

  // Other
  "common.saved": "Guardado",
  "settings.coachesAssignGroup": "Los entrenadores pueden asignar entrenamientos a tu grupo; todos los nadadores del grupo los verán.",

  // Notifications
  "notif.coachWroteWorkout": "El entrenador {name} ha escrito un nuevo entrenamiento para:",
  "notif.swimmerWroteOwnWorkout": "{name} ha escrito su propio entrenamiento para:",
  "notif.swimmerWroteYourWorkout": "{name} ha escrito tu entrenamiento para:",
  "notif.swimmerWroteWorkout": "{name} ha escrito un entrenamiento para:",
  "notif.addedFeedbackTo": "ha añadido un nuevo comentario a:",
  "notif.personAddedFeedback": "{name} ha añadido un nuevo comentario a:",
  "notif.today": "Hoy",
  "notif.tomorrow": "Mañana",
  "notif.yesterday": "Ayer",
  "notif.thisWeek": "Esta semana",
  "notif.noNotifications": "Sin notificaciones",

  // Setup page
  "setup.databaseSetup": "Configuración de base de datos",
  "setup.fixWorkoutSave": "Arreglar guardado de entrenamientos",
  "setup.fixWorkoutSaveDesc": "Si los entrenadores no pueden guardar entrenamientos, ejecuta esto en el Editor SQL de Supabase.",
  "setup.copyAll": "Copiar todo",
  "setup.poolSizePerWorkout": "Tamaño de piscina por entrenamiento",
  "setup.poolSizeDesc": "Permite a los entrenadores asignar LCM, SCM o SCY a cada entrenamiento. Con SCY, el análisis muestra yardas.",
  "setup.fullSetup": "Configuración completa (recomendado)",
  "setup.fullSetupDesc": "SQL completo con comentarios. Ejecuta una vez en el Editor SQL de Supabase.",
  "setup.feedbackOnly": "Solo comentarios (editar y eliminar)",
  "setup.feedbackOnlyDesc": "Si los nadadores pueden añadir comentarios pero no editarlos o eliminarlos, ejecuta este SQL en tu proyecto Supabase.",
  "setup.feedbackPerWorkout": "Comentarios por entrenamiento",
  "setup.feedbackPerWorkoutDesc": "Si el comentario de un nadador aparece en los entrenamientos de otros el mismo día, ejecuta esto para vincular los comentarios a cada entrenamiento.",
  "setup.feedbackPerUser": "Comentarios por usuario",
  "setup.feedbackPerUserDesc": "Si los nadadores pueden ver o editar los comentarios de otros, ejecuta esto para vincular los comentarios a cada usuario.",
  "setup.anonymousFeedback": "Comentarios anónimos",
  "setup.anonymousFeedbackDesc": "Permite a los nadadores enviar comentarios de forma anónima. Los entrenadores ven \"Anónimo\" en lugar del nombre. Después de añadir la columna, ejecuta la recarga del esquema más abajo.",
  "setup.optionalIntensity": "Valoraciones de intensidad opcionales",
  "setup.optionalIntensityDesc": "Permite a los nadadores añadir comentarios sin valorar la intensidad muscular/cardio (1–5).",
  "setup.workoutsSaveType": "Entrenamientos: guardar y tipo/categoría",
  "setup.workoutsSaveTypeDesc": "Si el entrenador no puede guardar entrenamientos o el tipo/categoría no funcionan, ejecuta este SQL.",
  "setup.workoutGroups": "Grupos de entrenamiento",
  "setup.workoutGroupsDesc": "Permite asignar entrenamientos a grupos (Sprint, Medio fondo, Fondo). Los nadadores eligen su grupo en Ajustes; los entrenadores asignan a un nadador o grupo.",
  "setup.coachTeamManagement": "Gestión de equipo del entrenador",
  "setup.coachTeamManagementDesc": "Si mover nadadores a grupos en Ajustes no guarda, ejecuta esto en el Editor SQL de Supabase.",
  "setup.workoutCategoryPool": "Categoría y tamaño de piscina no se guardan",
  "setup.workoutCategoryPoolDesc": "Si el tipo (Recuperación, Aeróbico, etc.) o el tamaño (LCM, SCM, SCY) no persisten, ejecuta esto en el Editor SQL de Supabase.",
  "setup.schemaCacheError": "Guardado del entrenador: error de caché del esquema",
  "setup.schemaCacheErrorDesc": "Si el guardado falla con un error de caché del esquema, ejecuta NOTIFY pgrst, 'reload schema'; en el Editor SQL de Supabase.",
  "setup.setupFooter": "Usa \"Configuración completa\" para una instalación nueva, o los bloques más pequeños para problemas específicos.",
  "setup.openSupabase": "Abrir Supabase Dashboard",
  "setup.selectProject": "Selecciona tu proyecto → Editor SQL",
  "setup.pasteAndRun": "Pega el SQL de arriba y ejecútalo",
  "setup.thenRunSchema": "Luego ejecuta esto para refrescar la caché del esquema (necesario para anónimo):",
};

const TRANSLATIONS: Record<Locale, Record<TranslationKey, string>> = {
  "en-US": TRANSLATIONS_EN,
  "es-ES": TRANSLATIONS_ES,
};

export function getTranslation(locale: Locale, key: TranslationKey, params?: Record<string, string>): string {
  const str = TRANSLATIONS[locale]?.[key] ?? TRANSLATIONS["en-US"][key] ?? key;
  if (!params) return str;
  return Object.entries(params).reduce((s, [k, v]) => s.replace(new RegExp(`\\{${k}\\}`, "g"), v), str);
}

/** Swimmer group value to translation key */
export const GROUP_KEYS: Record<string, TranslationKey> = {
  Sprint: "group.sprint",
  "Middle distance": "group.middleDistance",
  Distance: "group.distance",
};

/** Pool size value to translation key */
export const POOL_KEYS: Record<string, TranslationKey> = {
  LCM: "pool.lcm",
  SCM: "pool.scm",
  SCY: "pool.scy",
};

/** Workout category value to translation key */
export const CATEGORY_KEYS: Record<string, TranslationKey> = {
  "": "category.empty",
  Recovery: "category.recovery",
  Aerobic: "category.aerobic",
  Pace: "category.pace",
  Speed: "category.speed",
  "Tech suit": "category.techSuit",
};

export function getCategoryLabel(value: string, t: (k: TranslationKey) => string): string {
  if (!value) return t("main.category");
  if (value === "Workout") return t("category.workout");
  const key = CATEGORY_KEYS[value];
  return key ? t(key) : value;
}

export function getPoolLabel(value: string | null | undefined, t: (k: TranslationKey) => string): string {
  if (!value) return "";
  const key = POOL_KEYS[value];
  return key ? t(key) : value;
}

/** Workout set name (normalized) to translation key */
const SET_NAME_KEYS: Record<string, TranslationKey> = {
  "warm up": "set.warmUp",
  warmup: "set.warmUp",
  "warm-up": "set.warmUp",
  calentamiento: "set.warmUp",
  "main set": "set.mainSet",
  "set principal": "set.mainSet",
  "pre set": "set.preSet",
  "pre-set": "set.preSet",
  preset: "set.preSet",
  "cool down": "set.coolDown",
  cooldown: "set.coolDown",
  "cool-down": "set.coolDown",
  suave: "set.coolDown",
  "vuelta a la calma": "set.coolDown",
  "pull set": "set.pullSet",
  pulls: "set.pullSet",
  "kick set": "set.kickSet",
  kicks: "set.kickSet",
  "speed set": "set.speedSet",
  speed: "set.speedSet",
};

export function getSetNameLabel(name: string, t: (k: TranslationKey) => string): string {
  const suffixMatch = name.match(/(\s*#\s*\d+)\s*$/i);
  const suffix = suffixMatch ? suffixMatch[1] : "";
  const base = name.replace(/\s*#\s*\d+\s*$/i, "").trim();
  const normalized = base.toLowerCase().replace(/\s+/g, " ").trim();
  const key = SET_NAME_KEYS[normalized] ?? SET_NAME_KEYS[normalized.replace(/-/g, " ")];
  return key ? t(key) + suffix : name;
}

/** Session value to translation key */
export const SESSION_KEYS: Record<string, TranslationKey> = {
  AM: "session.am",
  PM: "session.pm",
  "": "main.anytime",
  Anytime: "main.anytime",
};

/** Capitalize first letter of day and month in Spanish date strings (e.g. "viernes, 20 de marzo, 2026" → "Viernes, 20 de Marzo, 2026") */
function capitalizeSpanishDate(str: string): string {
  return str
    .replace(/^\w/, (c) => c.toUpperCase())
    .replace(/ de (\w)/g, (_, c) => ` de ${c.toUpperCase()}`);
}

export type DateFormatType =
  | "long"       // Friday, March 20, 2026  /  Viernes, 20 de Marzo, 2026
  | "short"     // Fri, Mar 20  /  vie, 20 de mar
  | "dateBar"   // EEE, MMM d for day view
  | "weekRange" // MMM d – MMM d
  | "monthYear" // March 2026  /  Marzo 2026
  | "weekOf"    // Week of MMM d – MMM d, yyyy
  | "memberSince"; // MMMM d, yyyy

export function formatDate(
  date: Date,
  formatType: DateFormatType,
  locale: Locale,
  endDate?: Date
): string {
  const opts = locale === "es-ES" ? { locale: es } : {};
  const capitalize = (s: string) => (locale === "es-ES" ? capitalizeSpanishDate(s) : s);
  const end = endDate ?? date;

  switch (formatType) {
    case "long":
      return capitalize(
        locale === "es-ES"
          ? dateFnsFormat(date, "EEEE, d 'de' MMMM, yyyy", opts)
          : dateFnsFormat(date, "EEEE, MMMM d, yyyy", opts)
      );
    case "short":
      return capitalize(
        locale === "es-ES"
          ? dateFnsFormat(date, "EEE, d 'de' MMM", opts)
          : dateFnsFormat(date, "EEE, MMM d", opts)
      );
    case "dateBar":
      return capitalize(
        locale === "es-ES"
          ? dateFnsFormat(date, "EEE, d 'de' MMM", opts)
          : dateFnsFormat(date, "EEE, MMM d", opts)
      );
    case "weekRange":
      return locale === "es-ES"
        ? `${dateFnsFormat(date, "d 'de' MMM", opts)} – ${dateFnsFormat(end, "d 'de' MMM", opts)}`
        : `${dateFnsFormat(date, "MMM d", opts)} – ${dateFnsFormat(end, "MMM d", opts)}`;
    case "monthYear":
      return capitalize(
        locale === "es-ES"
          ? dateFnsFormat(date, "MMMM yyyy", opts)
          : dateFnsFormat(date, "MMMM yyyy", opts)
      );
    case "weekOf":
      return locale === "es-ES"
        ? `Semana del ${dateFnsFormat(date, "d 'de' MMM", opts)} – ${dateFnsFormat(end, "d 'de' MMM, yyyy", opts)}`
        : `Week of ${dateFnsFormat(date, "MMM d", opts)} – ${dateFnsFormat(end, "MMM d, yyyy", opts)}`;
    case "memberSince":
      return capitalize(
        locale === "es-ES"
          ? dateFnsFormat(date, "d 'de' MMMM, yyyy", opts)
          : dateFnsFormat(date, "MMMM d, yyyy", opts)
      );
    default:
      return dateFnsFormat(date, "PP", opts);
  }
}

export function formatPdfWorkoutHeaderDate(
  date: Date,
  session: string | null | undefined,
  locale: Locale,
  t: (key: TranslationKey) => string,
): string {
  const opts = locale === "es-ES" ? { locale: es } : {};
  const capitalize = (s: string) => (locale === "es-ES" ? capitalizeSpanishDate(s) : s);
  const sessionLabel =
    session?.trim() === "AM" || session?.trim() === "PM"
      ? session.trim()
      : t("main.anytime");
  const weekday = capitalize(dateFnsFormat(date, "EEEE", opts));
  const datePart = capitalize(
    locale === "es-ES"
      ? dateFnsFormat(date, "d 'de' MMMM, yyyy", opts)
      : dateFnsFormat(date, "MMMM d, yyyy", opts),
  );
  return `${weekday} ${sessionLabel}, ${datePart}`;
}

/** Format date for notification workout line: "Today AM", "Tomorrow PM", "This week: Friday, March 20" AM, or "March 20, 2026" AM */
export function formatNotificationWorkoutDate(date: Date, session: string | null, locale: Locale, t: (k: TranslationKey) => string): string {
  const label = session?.trim() === "AM" || session?.trim() === "PM" ? session.trim() : t("main.anytime");
  const opts = locale === "es-ES" ? { locale: es } : {};
  const capitalize = (s: string) => (locale === "es-ES" ? capitalizeSpanishDate(s) : s);
  if (isToday(date)) return `${t("notif.today")} ${label}`;
  if (isTomorrow(date)) return `${t("notif.tomorrow")} ${label}`;
  if (isThisWeek(date)) return `${t("notif.thisWeek")}: ${capitalize(dateFnsFormat(date, locale === "es-ES" ? "EEEE, d 'de' MMMM" : "EEEE, MMMM d", opts))} ${label}`;
  return `${capitalize(dateFnsFormat(date, locale === "es-ES" ? "d 'de' MMMM, yyyy" : "MMMM d, yyyy", opts))} ${label}`;
}

/** Format date for notification feedback line */
export function formatNotificationFeedbackDate(date: Date, session: string | null, locale: Locale, t: (k: TranslationKey) => string): string {
  const opts = locale === "es-ES" ? { locale: es } : {};
  const capitalize = (s: string) => (locale === "es-ES" ? capitalizeSpanishDate(s) : s);
  if (isToday(date)) return t("notif.today");
  if (isYesterday(date)) return t("notif.yesterday");
  if (isThisWeek(date)) return `${t("notif.thisWeek")}: ${capitalize(dateFnsFormat(date, locale === "es-ES" ? "EEEE, d 'de' MMMM" : "EEEE, MMMM d", opts))}`;
  const label = session?.trim() === "AM" || session?.trim() === "PM" ? session.trim() : t("main.anytime");
  return `${capitalize(dateFnsFormat(date, locale === "es-ES" ? "d 'de' MMMM, yyyy" : "MMMM d, yyyy", opts))} ${label}`;
}

