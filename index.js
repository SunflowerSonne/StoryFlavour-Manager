const extensionName = 'StoryFlavour-Manager';
const extensionFolderPath = `third-party/${extensionName}`;

const SF_LOREBOOKS = {
    SF_Accents: 'accents',
    SF_Genre: 'genre',
    SF_Tone: 'tone',
    SF_WriteStyle: 'writeStyle',
};

let availableEntries = {
    accents: [],
    genre: [],
    tone: [],
    writeStyle: [],
};

let isApplying = false;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ctx() {
    return SillyTavern.getContext();
}

function settings() {
    const c = ctx();
    if (!c.extensionSettings[extensionName]) {
        c.extensionSettings[extensionName] = { profiles: {}, autoSwitch: true };
    }
    return c.extensionSettings[extensionName];
}

function saveSettings() {
    ctx().saveSettingsDebounced();
}

async function runSlash(command) {
    try {
        const result = await ctx().executeSlashCommandsWithOptions(command, {
            handleExecutionErrors: false,
            handleParserErrors: false,
        });
        return result?.pipe != null ? String(result.pipe) : '';
    } catch (err) {
        console.warn(`[${extensionName}] Slash failed: ${command}`, err);
        return '';
    }
}

// ---------------------------------------------------------------------------
// World Info entry discovery — read lorebook data directly
// ---------------------------------------------------------------------------

async function fetchLorebook(name) {
    const response = await fetch('/api/worldinfo/get', {
        method: 'POST',
        headers: ctx().getRequestHeaders(),
        body: JSON.stringify({ name }),
    });
    if (!response.ok) return null;
    return await response.json();
}

async function loadAvailableEntries() {
    availableEntries = { accents: [], genre: [], tone: [], writeStyle: [] };

    for (const [lorebookName, categoryKey] of Object.entries(SF_LOREBOOKS)) {
        try {
            const data = await fetchLorebook(lorebookName);
            if (!data || !data.entries) continue;

            for (const entry of Object.values(data.entries)) {
                availableEntries[categoryKey].push({
                    uid: entry.uid,
                    comment: entry.comment || `Entry ${entry.uid}`,
                });
            }
        } catch (err) {
            console.warn(`[${extensionName}] Could not load ${lorebookName}:`, err);
        }
    }

    console.log(`[${extensionName}] Entries loaded:`,
        Object.fromEntries(Object.entries(availableEntries).map(([k, v]) => [k, v.length])),
    );
}

// ---------------------------------------------------------------------------
// Profile CRUD
// ---------------------------------------------------------------------------

function getProfiles() {
    return settings().profiles;
}

function getProfile(name) {
    return getProfiles()[name];
}

function createProfile(name, data) {
    const profiles = getProfiles();
    if (profiles[name]) throw new Error(`Profile "${name}" already exists`);
    profiles[name] = {
        accents: data.accents || [],
        genre: data.genre || [],
        tone: data.tone || [],
        writeStyle: data.writeStyle || [],
        description: data.description || '',
    };
    saveSettings();
    return profiles[name];
}

function updateProfile(name, data) {
    const profiles = getProfiles();
    if (!profiles[name]) throw new Error(`Profile "${name}" not found`);
    Object.assign(profiles[name], data);
    saveSettings();
    return profiles[name];
}

function deleteProfile(name) {
    const profiles = getProfiles();
    if (!profiles[name]) throw new Error(`Profile "${name}" not found`);
    delete profiles[name];

    const c = ctx();
    if (c.chatMetadata?.sf_activeProfile === name) {
        delete c.chatMetadata.sf_activeProfile;
        c.saveMetadataDebounced();
    }
    saveSettings();
}

// ---------------------------------------------------------------------------
// Profile application
// ---------------------------------------------------------------------------

async function applyProfile(profileName) {
    const profile = getProfile(profileName);
    if (!profile) {
        toastr.error(`Profile "${profileName}" not found`);
        return;
    }

    if (isApplying) return;
    isApplying = true;
    $('#storyFlavour-profile-list').addClass('storyFlavour-applying');

    try {
        for (const [lorebookName, categoryKey] of Object.entries(SF_LOREBOOKS)) {
            const enabledUids = profile[categoryKey] || [];
            const entries = availableEntries[categoryKey];

            for (const entry of entries) {
                const shouldDisable = !enabledUids.includes(entry.uid);
                await runSlash(`/setentryfield file=${lorebookName} uid=${entry.uid} field=disable ${shouldDisable}`);
            }
        }

        const c = ctx();
        if (c.chatMetadata) {
            c.chatMetadata.sf_activeProfile = profileName;
            c.saveMetadataDebounced();
        }

        toastr.success(`Profile "${profileName}" applied`);
        console.log(`[${extensionName}] Applied profile: ${profileName}`);
    } catch (err) {
        console.error(`[${extensionName}] Error applying profile:`, err);
        toastr.error(`Failed to apply profile: ${err.message}`);
    } finally {
        isApplying = false;
        $('#storyFlavour-profile-list').removeClass('storyFlavour-applying');
        renderProfileList();
    }
}

function getActiveProfileName() {
    return ctx().chatMetadata?.sf_activeProfile || null;
}

// ---------------------------------------------------------------------------
// Export / Import
// ---------------------------------------------------------------------------

function exportProfile(name) {
    const profile = getProfile(name);
    if (!profile) throw new Error(`Profile "${name}" not found`);
    return JSON.stringify({ name, ...profile, exportDate: new Date().toISOString() }, null, 2);
}

function importProfileFromJSON(jsonString) {
    const data = JSON.parse(jsonString);
    const name = data.name;
    if (!name) throw new Error('Profile name missing in JSON');
    if (!Array.isArray(data.accents) || !Array.isArray(data.genre) ||
        !Array.isArray(data.tone) || !Array.isArray(data.writeStyle)) {
        throw new Error('Invalid profile data structure');
    }
    createProfile(name, data);
    return name;
}

// ---------------------------------------------------------------------------
// UI rendering
// ---------------------------------------------------------------------------

function renderProfileList() {
    const profiles = getProfiles();
    const names = Object.keys(profiles);
    const activeProfile = getActiveProfileName();
    const container = $('#storyFlavour-profile-list');

    container.empty();

    if (names.length === 0) {
        container.html('<div class="storyFlavour-no-profiles">No profiles yet. Create one to get started!</div>');
        return;
    }

    for (const name of names) {
        const profile = profiles[name];
        const isActive = name === activeProfile;
        const totalEntries =
            (profile.accents?.length || 0) +
            (profile.genre?.length || 0) +
            (profile.tone?.length || 0) +
            (profile.writeStyle?.length || 0);

        const escapedName = name.replace(/"/g, '&quot;');
        const html = `
            <div class="storyFlavour-profile-item ${isActive ? 'storyFlavour-profile-item--active' : ''}">
                <label class="storyFlavour-profile-name">
                    <input type="radio" name="storyFlavour-profile-radio"
                           class="storyFlavour-profile-select" value="${escapedName}"
                           ${isActive ? 'checked' : ''}>
                    <span>${name}</span>
                    <span class="storyFlavour-profile-badge">${totalEntries}</span>
                    ${isActive ? '<span class="storyFlavour-active-tag">[Active]</span>' : ''}
                </label>
                <div class="storyFlavour-profile-actions">
                    <button class="storyFlavour-btn storyFlavour-edit-btn"   data-profile="${escapedName}" title="Edit">
                        <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                    <button class="storyFlavour-btn storyFlavour-export-btn" data-profile="${escapedName}" title="Export">
                        <i class="fa-solid fa-file-export"></i>
                    </button>
                    <button class="storyFlavour-btn storyFlavour-btn-danger storyFlavour-delete-btn"
                            data-profile="${escapedName}" title="Delete">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </div>`;
        container.append(html);
    }
}

function renderEditorCheckboxes(profile) {
    const categories = ['accents', 'genre', 'tone', 'writeStyle'];
    for (const cat of categories) {
        const container = $(`#storyFlavour-${cat}-checkboxes`);
        container.empty();

        const items = availableEntries[cat];
        if (!items || items.length === 0) {
            container.html(`<p class="storyFlavour-empty-hint">No ${cat} entries found in lorebook</p>`);
            continue;
        }

        const selected = profile ? (profile[cat] || []) : [];
        for (const item of items) {
            const checked = selected.includes(item.uid) ? 'checked' : '';
            container.append(`
                <label class="storyFlavour-checkbox-item">
                    <input type="checkbox" class="storyFlavour-editor-checkbox"
                           data-type="${cat}" data-uid="${item.uid}" ${checked}>
                    <span>${item.comment}</span>
                </label>`);
        }
    }
}

function showEditorModal(profileName) {
    const isNew = !profileName;
    const profile = isNew ? null : getProfile(profileName);

    $('#storyFlavour-modal-title').text(isNew ? 'Create New Profile' : `Edit: ${profileName}`);

    const nameInput = $('#storyFlavour-profile-name-input');
    nameInput.val(isNew ? '' : profileName);
    nameInput.prop('readonly', !isNew);

    $('#storyFlavour-profile-desc-input').val(profile?.description || '');

    renderEditorCheckboxes(profile);

    const modal = $('#storyFlavour-editor-modal');
    modal.addClass('active');

    // Force styles to ensure modal is on top
    modal.css({
        'position': 'fixed',
        'z-index': '2147483647',
        'top': '0',
        'left': '0',
        'right': '0',
        'bottom': '0',
        'width': '100vw',
        'height': '100vh',
        'display': 'block'
    });

    // Prevent body scroll
    $('body').css('overflow', 'hidden');
}

function closeEditorModal() {
    const modal = $('#storyFlavour-editor-modal');
    modal.removeClass('active');
    // Remove inline styles
    modal.css({
        'position': '',
        'z-index': '',
        'top': '',
        'left': '',
        'right': '',
        'bottom': '',
        'width': '',
        'height': '',
        'display': ''
    });
    // Restore body scroll
    $('body').css('overflow', '');
}

function gatherEditorData() {
    const categories = ['accents', 'genre', 'tone', 'writeStyle'];
    const data = {};
    for (const cat of categories) {
        data[cat] = $(`.storyFlavour-editor-checkbox[data-type="${cat}"]:checked`)
            .map(function () { return parseInt($(this).data('uid'), 10); })
            .get();
    }
    data.description = $('#storyFlavour-profile-desc-input').val().trim();
    return data;
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

function attachEventListeners() {
    $(document).on('change', '.storyFlavour-profile-select', async function () {
        await applyProfile($(this).val());
    });

    $(document).on('click', '.storyFlavour-edit-btn', function () {
        showEditorModal($(this).data('profile'));
    });

    $(document).on('click', '.storyFlavour-delete-btn', function () {
        const name = $(this).data('profile');
        if (!confirm(`Delete profile "${name}"?`)) return;
        try {
            deleteProfile(name);
            renderProfileList();
            toastr.success(`Profile "${name}" deleted`);
        } catch (err) {
            toastr.error(err.message);
        }
    });

    $(document).on('click', '.storyFlavour-export-btn', function () {
        const name = $(this).data('profile');
        try {
            const json = exportProfile(name);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `StoryFlavour_${name}.json`;
            a.click();
            URL.revokeObjectURL(url);
            toastr.success(`Profile "${name}" exported`);
        } catch (err) {
            toastr.error(err.message);
        }
    });

    $(document).on('click', '#storyFlavour-create-btn', () => showEditorModal(null));

    $(document).on('click', '#storyFlavour-import-btn', () => {
        $('#storyFlavour-import-file').click();
    });

    $(document).on('change', '#storyFlavour-import-file', function () {
        const file = this.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const name = importProfileFromJSON(e.target.result);
                renderProfileList();
                toastr.success(`Profile "${name}" imported`);
            } catch (err) {
                toastr.error(`Import failed: ${err.message}`);
            }
        };
        reader.readAsText(file);
        this.value = '';
    });

    $(document).on('click', '#storyFlavour-modal-save', () => {
        const name = $('#storyFlavour-profile-name-input').val().trim();
        if (!name) {
            toastr.warning('Profile name is required');
            return;
        }

        const data = gatherEditorData();
        const exists = !!getProfile(name);

        try {
            if (exists) {
                updateProfile(name, data);
                toastr.success(`Profile "${name}" updated`);
            } else {
                createProfile(name, data);
                toastr.success(`Profile "${name}" created`);
            }
            renderProfileList();
            closeEditorModal();
        } catch (err) {
            toastr.error(err.message);
        }
    });

    $(document).on('click', '#storyFlavour-modal-cancel', closeEditorModal);

    $(document).on('change', '#storyFlavour-auto-switch', function () {
        settings().autoSwitch = $(this).is(':checked');
        saveSettings();
    });
}

// ---------------------------------------------------------------------------
// Chat-changed handler
// ---------------------------------------------------------------------------

async function onChatChanged() {
    const activeName = getActiveProfileName();
    if (activeName && settings().autoSwitch && getProfile(activeName)) {
        console.log(`[${extensionName}] Auto-switching to profile: ${activeName}`);
        await applyProfile(activeName);
    }
    renderProfileList();
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

jQuery(async () => {
    console.log(`[${extensionName}] Initializing...`);

    const c = ctx();

    settings();

    const { renderExtensionTemplateAsync } = c;
    const settingsHtml = await renderExtensionTemplateAsync(extensionFolderPath, 'settings');
    $('#extensions_settings2').append(settingsHtml);

    // Move modal to body immediately to ensure proper z-index stacking
    const modal = $('#storyFlavour-editor-modal');
    if (modal.length > 0) {
        modal.detach().appendTo('body');
        console.log(`[${extensionName}] Modal moved to body`);
    }

    $('#storyFlavour-auto-switch').prop('checked', settings().autoSwitch);

    attachEventListeners();

    await loadAvailableEntries();

    renderProfileList();

    c.eventSource.on(c.event_types.CHAT_CHANGED, onChatChanged);

    console.log(`[${extensionName}] Initialized`);
});
