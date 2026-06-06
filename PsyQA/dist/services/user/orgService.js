"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureOrganizations = ensureOrganizations;
exports.getCollegeById = getCollegeById;
exports.getSchoolById = getSchoolById;
exports.resolveOrgDisplay = resolveOrgDisplay;
exports.listCollegesForScope = listCollegesForScope;
exports.listCollegeOptions = listCollegeOptions;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const paths_1 = require("../../config/paths");
const dataPath = (0, paths_1.resolveDataFile)('organizations.json');
const DEFAULT_ORGS = {
    schools: [{ id: 'psy-u', name: '心理港湾示范大学' }],
    colleges: [
        { id: 'cs-demo', schoolId: 'psy-u', name: '计算机学院' },
        { id: 'math-demo', schoolId: 'psy-u', name: '数学学院' }
    ]
};
function readOrgs() {
    try {
        if (!fs_1.default.existsSync(dataPath))
            return DEFAULT_ORGS;
        const raw = JSON.parse(fs_1.default.readFileSync(dataPath, 'utf8'));
        if (!Array.isArray(raw.schools) || !Array.isArray(raw.colleges))
            return DEFAULT_ORGS;
        return raw;
    }
    catch (_a) {
        return DEFAULT_ORGS;
    }
}
function writeOrgs(data) {
    const dir = path_1.default.dirname(dataPath);
    if (!fs_1.default.existsSync(dir))
        fs_1.default.mkdirSync(dir, { recursive: true });
    fs_1.default.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
}
function ensureOrganizations() {
    const data = readOrgs();
    if (!fs_1.default.existsSync(dataPath))
        writeOrgs(data);
    return data;
}
function getCollegeById(collegeId) {
    var _a;
    return (_a = ensureOrganizations().colleges.find((c) => c.id === collegeId)) !== null && _a !== void 0 ? _a : null;
}
function getSchoolById(schoolId) {
    var _a;
    return (_a = ensureOrganizations().schools.find((s) => s.id === schoolId)) !== null && _a !== void 0 ? _a : null;
}
function resolveOrgDisplay(collegeId) {
    var _a, _b, _c;
    const college = collegeId ? getCollegeById(collegeId) : null;
    const school = college ? getSchoolById(college.schoolId) : null;
    return {
        schoolName: (_a = school === null || school === void 0 ? void 0 : school.name) !== null && _a !== void 0 ? _a : '心理港湾示范大学',
        collegeName: (_c = (_b = college === null || college === void 0 ? void 0 : college.name) !== null && _b !== void 0 ? _b : collegeId) !== null && _c !== void 0 ? _c : '未分配院系'
    };
}
function listCollegesForScope(managedOrgIds, role) {
    const all = ensureOrganizations().colleges;
    if (role === 'admin')
        return all;
    if (managedOrgIds === null || managedOrgIds === void 0 ? void 0 : managedOrgIds.length)
        return all.filter((c) => managedOrgIds.includes(c.id));
    return all;
}
function listCollegeOptions() {
    const orgs = ensureOrganizations();
    return orgs.colleges.map((c) => {
        var _a;
        const school = getSchoolById(c.schoolId);
        return {
            id: c.id,
            name: c.name,
            schoolName: (_a = school === null || school === void 0 ? void 0 : school.name) !== null && _a !== void 0 ? _a : '心理港湾示范大学'
        };
    });
}
